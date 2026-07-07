"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runClaude } = require("../src/run-claude");

test("runClaude separates variadic flags from prompt", async () => {
  let capturedArgs;
  const fakePty = {
    spawn(_cmd, args) {
      capturedArgs = args;
      return {
        onData() {},
        onExit(callback) {
          setImmediate(() => callback({ exitCode: 0 }));
        },
        kill() {},
      };
    },
  };

  const result = await runClaude(
    {
      sessionId: "s1",
      claudeArgs: ["--tools", ""],
      prompt: "Respond exactly: CLAUDE_P_OK",
      cwd: process.cwd(),
      timeoutSec: 1,
      quietAfterSec: 1,
      preserveProviderEnv: false,
    },
    {
      pty: fakePty,
      readPersistedAssistant: () => ({ text: "ok", terminal: true }),
    },
  );

  assert.deepEqual(capturedArgs, [
    "--session-id",
    "s1",
    "--tools",
    "",
    "--",
    "Respond exactly: CLAUDE_P_OK",
  ]);
  assert.equal(result.answer, "ok");
});
