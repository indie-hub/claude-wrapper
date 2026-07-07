"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { doctor } = require("./doctor");
const { emitJson, emitStreamJson } = require("./format");
const { runClaude } = require("./run-claude");

class CliError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

const PROVIDER_ENV = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
]);

const WRAPPER_VALUE_FLAGS = new Map([
  ["--output-format", "outputFormat"],
  ["--cwd", "cwd"],
  ["--timeout-sec", "timeoutSec"],
  ["--quiet-after-sec", "quietAfterSec"],
  ["--session-id", "sessionId"],
  ["--raw-log", "rawLog"],
]);

const PASS_VALUE_FLAGS = new Set([
  "--add-dir",
  "--agent",
  "--agents",
  "--allowedTools",
  "--allowed-tools",
  "--append-system-prompt",
  "--betas",
  "--debug",
  "--debug-file",
  "--disallowedTools",
  "--disallowed-tools",
  "--effort",
  "--file",
  "--from-pr",
  "--json-schema",
  "--mcp-config",
  "--model",
  "--name",
  "--permission-mode",
  "--plugin-dir",
  "--plugin-url",
  "--remote-control",
  "--remote-control-session-name-prefix",
  "--resume",
  "-r",
  "--setting-sources",
  "--settings",
  "--system-prompt",
  "--tmux",
  "--tools",
  "--worktree",
  "-w",
]);

const PASS_BOOLEAN_FLAGS = new Set([
  "--allow-dangerously-skip-permissions",
  "--brief",
  "--chrome",
  "--no-chrome",
  "--continue",
  "-c",
  "--dangerously-skip-permissions",
  "--disable-slash-commands",
  "--exclude-dynamic-system-prompt-sections",
  "--fork-session",
  "--ide",
  "--mcp-debug",
  "--strict-mcp-config",
  "--verbose",
]);

const NOOP_FLAGS = new Set([
  "-p",
  "--print",
  "--include-hook-events",
  "--include-partial-messages",
]);

const UNSUPPORTED_FLAGS = new Set([
  "--bare",
  "--fallback-model",
  "--max-budget-usd",
  "--no-session-persistence",
  "--replay-user-messages",
]);

function readPackageVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
    );
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function takeValue(argv, index, flag) {
  if (index + 1 >= argv.length) {
    throw new CliError(`${flag} requires a value`);
  }
  return argv[index + 1];
}

function parseNumber(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new CliError(`${flag} must be a positive number`);
  }
  return number;
}

function parseArgs(argv) {
  const opts = {
    outputFormat: "text",
    cwd: process.cwd(),
    timeoutSec: 90,
    quietAfterSec: 3,
    sessionId: cryptoRandomId(),
    rawLog: null,
    preserveProviderEnv: false,
    doctor: false,
    help: false,
    version: false,
    claudeArgs: [],
    promptParts: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      opts.promptParts.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      opts.version = true;
      continue;
    }
    if (arg === "--doctor") {
      opts.doctor = true;
      continue;
    }
    if (arg === "--preserve-provider-env") {
      opts.preserveProviderEnv = true;
      continue;
    }
    if (UNSUPPORTED_FLAGS.has(arg)) {
      throw new CliError(`${arg} is not supported by the TUI-backed wrapper`);
    }
    if (NOOP_FLAGS.has(arg)) {
      continue;
    }
    if (arg === "--input-format") {
      const value = takeValue(argv, i, arg);
      if (value !== "text") {
        throw new CliError("--input-format stream-json is not supported");
      }
      i += 1;
      continue;
    }
    if (WRAPPER_VALUE_FLAGS.has(arg)) {
      const key = WRAPPER_VALUE_FLAGS.get(arg);
      const value = takeValue(argv, i, arg);
      opts[key] = value;
      i += 1;
      continue;
    }
    if (PASS_VALUE_FLAGS.has(arg)) {
      const value = takeValue(argv, i, arg);
      opts.claudeArgs.push(arg, value);
      i += 1;
      continue;
    }
    if (PASS_BOOLEAN_FLAGS.has(arg)) {
      opts.claudeArgs.push(arg);
      continue;
    }
    if (arg.startsWith("--")) {
      throw new CliError(`unsupported option: ${arg}`);
    }
    opts.promptParts.push(arg);
  }

  opts.timeoutSec = parseNumber(opts.timeoutSec, "--timeout-sec");
  opts.quietAfterSec = parseNumber(opts.quietAfterSec, "--quiet-after-sec");
  if (!["text", "json", "stream-json"].includes(opts.outputFormat)) {
    throw new CliError("--output-format must be text, json, or stream-json");
  }
  opts.prompt = opts.promptParts.join(" ").trim();
  return opts;
}

function cryptoRandomId() {
  return require("node:crypto").randomUUID();
}

function usage() {
  return [
    "Usage: claude-p [options] \"prompt\"",
    "",
    "Options:",
    "  --output-format text|json|stream-json",
    "  --model <name>",
    "  --tools <tools>",
    "  --permission-mode <mode>",
    "  --cwd <path>",
    "  --timeout-sec <seconds>",
    "  --quiet-after-sec <seconds>",
    "  --session-id <id>",
    "  --raw-log <path>",
    "  --preserve-provider-env",
    "  --doctor",
  ].join("\n");
}

async function main(argv = process.argv.slice(2), io = process) {
  const opts = parseArgs(argv);
  if (opts.help) {
    io.stdout.write(`${usage()}\n`);
    return;
  }
  if (opts.version) {
    io.stdout.write(`${readPackageVersion()}\n`);
    return;
  }
  if (opts.doctor) {
    io.stdout.write(doctor(opts));
    return;
  }
  if (!opts.prompt && !process.stdin.isTTY) {
    opts.prompt = fs.readFileSync(0, "utf8").trim();
  }
  if (!opts.prompt) {
    throw new CliError("empty prompt (positional or stdin required)");
  }

  const result = await runClaude(opts);
  if (opts.outputFormat === "json") {
    io.stdout.write(`${JSON.stringify(emitJson(result))}\n`);
    return;
  }
  if (opts.outputFormat === "stream-json") {
    io.stdout.write(emitStreamJson(result));
    return;
  }
  io.stdout.write(result.answer);
  if (result.answer && !result.answer.endsWith("\n")) {
    io.stdout.write("\n");
  }
}

module.exports = {
  CliError,
  PROVIDER_ENV,
  parseArgs,
  usage,
  main,
};
