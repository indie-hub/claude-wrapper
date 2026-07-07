"use strict";

const fs = require("node:fs");

const {
  extractAssistantSnapshot,
  readPersistedAssistant,
} = require("./extract");

const PROVIDER_ENV = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
];

function buildClaudeEnv(source = process.env, preserveProviderEnv = false) {
  const env = { ...source };
  if (!preserveProviderEnv) {
    for (const name of PROVIDER_ENV) {
      delete env[name];
    }
  }
  env.NO_COLOR = "1";
  env.TERM = env.TERM || "xterm-256color";
  return env;
}

function runClaude(opts, deps = {}) {
  const pty = deps.pty || require("@lydell/node-pty");
  const now = deps.now || (() => Date.now());
  const readAssistant = deps.readPersistedAssistant || readPersistedAssistant;
  const timeoutMs = Math.ceil(opts.timeoutSec * 1000);
  const quietMs = Math.ceil(opts.quietAfterSec * 1000);
  const args = ["--session-id", opts.sessionId, ...opts.claudeArgs, "--", opts.prompt];
  const startedAt = now();
  const raw = [];
  let lastDataAt = startedAt;
  let lastSnapshot = "";
  let exitCode = null;
  let timedOut = true;
  let settled = false;
  let proc;

  return new Promise((resolve, reject) => {
    function finish(reason) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      clearInterval(pollTimer);

      if (proc && exitCode === null && reason !== "exit") {
        try {
          proc.kill();
        } catch {
          // Best effort. node-pty may already have closed.
        }
      }

      const transcript = raw.join("");
      if (opts.rawLog) {
        fs.writeFileSync(opts.rawLog, transcript);
      }
      const persisted = readAssistant(opts.sessionId);
      const answer = persisted && persisted.text ? persisted.text : extractAssistantSnapshot(transcript);
      resolve({
        answer,
        transcript,
        sessionId: opts.sessionId,
        exitCode,
        timedOut: reason === "timeout",
        durationMs: now() - startedAt,
      });
    }

    let timeoutTimer;
    let pollTimer;
    try {
      proc = pty.spawn("claude", args, {
        name: "xterm-256color",
        cols: 120,
        rows: 40,
        cwd: opts.cwd,
        env: buildClaudeEnv(process.env, opts.preserveProviderEnv),
      });
    } catch (err) {
      reject(err);
      return;
    }

    proc.onData((data) => {
      raw.push(data);
      lastDataAt = now();
      const snapshot = extractAssistantSnapshot(raw.join(""));
      if (snapshot) {
        lastSnapshot = snapshot;
      }
    });

    proc.onExit((event) => {
      exitCode = event && Number.isInteger(event.exitCode) ? event.exitCode : 0;
      timedOut = false;
      finish("exit");
    });

    timeoutTimer = setTimeout(() => finish("timeout"), timeoutMs);
    pollTimer = setInterval(() => {
      const persisted = readAssistant(opts.sessionId);
      if (persisted && persisted.text && persisted.terminal) {
        timedOut = false;
        finish("persisted");
        return;
      }
      if (lastSnapshot && now() - lastDataAt >= quietMs) {
        timedOut = false;
        finish("quiet");
      }
    }, 250);
  });
}

module.exports = { buildClaudeEnv, runClaude };
