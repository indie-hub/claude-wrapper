"use strict";

const crypto = require("node:crypto");

function emitJson(result) {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    result: result.answer,
    session_id: result.sessionId,
    duration_ms: result.durationMs,
    exit_code: result.exitCode,
    timed_out: result.timedOut,
    usage: null,
  };
}

function line(obj) {
  return `${JSON.stringify(obj)}\n`;
}

function emitStreamJson(result) {
  const sessionId = result.sessionId;
  const messageId = `msg_${crypto.randomUUID().replace(/-/g, "")}`;
  return [
    line({ type: "system", subtype: "init", session_id: sessionId }),
    line({
      type: "stream_event",
      event: { type: "message_start", message: { id: messageId, type: "message", role: "assistant", content: [] } },
      session_id: sessionId,
    }),
    line({
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      session_id: sessionId,
    }),
    line({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: result.answer } },
      session_id: sessionId,
    }),
    line({
      type: "stream_event",
      event: { type: "content_block_stop", index: 0 },
      session_id: sessionId,
    }),
    line({
      type: "assistant",
      message: {
        id: messageId,
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: result.answer }],
        stop_reason: "end_turn",
        usage: null,
      },
      session_id: sessionId,
    }),
    line({
      type: "stream_event",
      event: { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: null },
      session_id: sessionId,
    }),
    line({ type: "stream_event", event: { type: "message_stop" }, session_id: sessionId }),
    line(emitJson(result)),
  ].join("");
}

module.exports = { emitJson, emitStreamJson };
