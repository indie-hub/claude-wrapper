"use strict";

const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROVIDER_ENV = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
];

function which(command) {
  const pathValue = process.env.PATH || "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const dir of pathValue.split(path.delimiter)) {
    for (const ext of extensions) {
      const candidate = path.join(dir, command.endsWith(ext) ? command : `${command}${ext}`);
      try {
        if (fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Keep scanning PATH.
      }
    }
  }
  return "";
}

function claudeVersion() {
  const result = spawnSync("claude", ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  return (result.stdout || result.stderr || "").trim() || "unknown";
}

function ptyStatus() {
  try {
    require("@lydell/node-pty");
    return "ok";
  } catch (err) {
    return `failed: ${err.message}`;
  }
}

function doctor(opts = {}) {
  const home = os.homedir();
  const sessionRoot = path.join(home, ".claude", "projects");
  const providerOverrides = PROVIDER_ENV.filter((name) => process.env[name]);
  return [
    "claude-p doctor",
    `node: ${process.version}`,
    `platform: ${process.platform}`,
    `arch: ${process.arch}`,
    `cwd: ${opts.cwd || process.cwd()}`,
    `home: ${home}`,
    `pty: ${ptyStatus()}`,
    `claude_path: ${which("claude") || "not found"}`,
    `claude_version: ${claudeVersion()}`,
    `session_root: ${sessionRoot}`,
    `temp_dir: ${os.tmpdir()}`,
    `provider_env_overrides_present: ${providerOverrides.join(",") || "none"}`,
    'smoke: claude-p "Respond exactly: CLAUDE_P_OK" --output-format json',
    "",
  ].join("\n");
}

module.exports = { doctor, which, ptyStatus };
