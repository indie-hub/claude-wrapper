"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cleanTerminal,
  extractAssistantSnapshot,
  readPersistedAssistant,
} = require("../src/extract");
const { emitJson, emitStreamJson } = require("../src/format");

test("cleanTerminal removes ANSI and carriage returns", () => {
  assert.equal(cleanTerminal("\x1b[31mred\x1b[0m\r\n"), "red\n");
});

test("extractAssistantSnapshot returns text after the last marker", () => {
  const transcript = "user prompt\n⏺ first\nnoise\n⏺ final answer\n";
  assert.equal(extractAssistantSnapshot(transcript), "final answer");
});

test("extractAssistantSnapshot ignores welcome screen without assistant marker", () => {
  assert.equal(extractAssistantSnapshot("Welcome back\nWhat's new?"), "");
});

test("readPersistedAssistant reads terminal assistant JSONL for session", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "claude-p-test-"));
  const project = path.join(home, ".claude", "projects", "repo");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(project, "session-abc.jsonl"),
    [
      JSON.stringify({
        type: "assistant",
        session_id: "session-abc",
        message: {
          content: [{ type: "text", text: "tool text" }],
          stop_reason: "tool_use",
        },
      }),
      JSON.stringify({
        type: "assistant",
        session_id: "session-abc",
        message: {
          content: [{ type: "text", text: "final text" }],
          stop_reason: "end_turn",
        },
      }),
      "",
    ].join("\n"),
  );

  const result = readPersistedAssistant("session-abc", home);
  assert.equal(result.text, "final text");
  assert.equal(result.terminal, true);
});

test("formatters emit core result shapes", () => {
  const result = {
    answer: "ok",
    sessionId: "s1",
    durationMs: 12,
    exitCode: 0,
    timedOut: false,
  };
  assert.equal(emitJson(result).result, "ok");
  const lines = emitStreamJson(result).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "system");
  assert.equal(lines.at(-1).type, "result");
  assert.equal(lines.at(-1).result, "ok");
});
