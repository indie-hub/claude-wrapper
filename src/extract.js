"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const OSC_RE = /\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
const SPINNER_RE = /\n?[\u2733\u2736\u273b\u273d\u2722\u00b7*+.][^\n]*$/;
const NON_TERMINAL_STOP_REASONS = new Set(["tool_use", "pause_turn"]);

function cleanTerminal(text) {
  return String(text || "")
    .replace(OSC_RE, "")
    .replace(ANSI_RE, "")
    .replace(/\r/g, "")
    .replace(/\x1b[78=>]/g, "");
}

function normalizeAnswer(text) {
  return cleanTerminal(text)
    .split(/\n?[-\u2500]{8,}/, 1)[0]
    .replace(SPINNER_RE, "")
    .trim();
}

function extractAssistantSnapshot(transcript) {
  const clean = cleanTerminal(transcript);
  const marker = clean.lastIndexOf("⏺");
  if (marker >= 0) {
    return normalizeAnswer(clean.slice(marker + 1));
  }
  return "";
}

function extractTextFromContent(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }
      return "";
    })
    .join("")
    .trim();
}

function eventSessionId(event) {
  return (
    event.session_id ||
    event.sessionId ||
    (event.session && event.session.id) ||
    (event.message && (event.message.session_id || event.message.sessionId)) ||
    ""
  );
}

function isTerminalAssistantMessage(message) {
  const stopReason = message && message.stop_reason;
  return !NON_TERMINAL_STOP_REASONS.has(stopReason);
}

function walkJsonlFiles(root) {
  const files = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(file);
      }
    }
  }
  walk(root);
  return files;
}

function readPersistedAssistant(sessionId, home = os.homedir()) {
  const root = path.join(home, ".claude", "projects");
  let latest = null;
  for (const file of walkJsonlFiles(root)) {
    const fileMatches = path.basename(file).includes(sessionId) || file.includes(sessionId);
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      const eventId = eventSessionId(event);
      if (!fileMatches && eventId && eventId !== sessionId) {
        continue;
      }
      if (!fileMatches && !eventId) {
        continue;
      }
      if (event.type !== "assistant" || !event.message || typeof event.message !== "object") {
        continue;
      }
      const text = extractTextFromContent(event.message.content);
      if (!text) {
        continue;
      }
      latest = {
        file,
        text,
        message: event.message,
        terminal: isTerminalAssistantMessage(event.message),
      };
    }
  }
  return latest;
}

module.exports = {
  cleanTerminal,
  normalizeAnswer,
  extractAssistantSnapshot,
  extractTextFromContent,
  readPersistedAssistant,
  isTerminalAssistantMessage,
};
