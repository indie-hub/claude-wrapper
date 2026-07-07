"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../src/cli");
const { buildClaudeEnv } = require("../src/run-claude");

test("parseArgs accepts wrapper and pass-through flags", () => {
  const opts = parseArgs([
    "--output-format",
    "json",
    "--model",
    "sonnet",
    "--tools",
    "",
    "--timeout-sec",
    "5",
    "hello",
    "world",
  ]);
  assert.equal(opts.outputFormat, "json");
  assert.equal(opts.timeoutSec, 5);
  assert.equal(opts.prompt, "hello world");
  assert.deepEqual(opts.claudeArgs, ["--model", "sonnet", "--tools", ""]);
});

test("parseArgs rejects unsupported API-only input mode", () => {
  assert.throws(
    () => parseArgs(["--input-format", "stream-json", "prompt"]),
    /not supported/,
  );
});

test("buildClaudeEnv strips provider env by default", () => {
  const env = buildClaudeEnv({
    ANTHROPIC_API_KEY: "api",
    ANTHROPIC_AUTH_TOKEN: "token",
    ANTHROPIC_BASE_URL: "url",
    KEEP: "yes",
  });
  assert.equal(env.KEEP, "yes");
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(env.ANTHROPIC_BASE_URL, undefined);
  assert.equal(env.NO_COLOR, "1");
});

test("buildClaudeEnv preserves provider env when requested", () => {
  const env = buildClaudeEnv({ ANTHROPIC_API_KEY: "api" }, true);
  assert.equal(env.ANTHROPIC_API_KEY, "api");
});
