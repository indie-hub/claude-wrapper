#!/usr/bin/env node
"use strict";

require("../src/cli").main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  process.stderr.write(`claude-p: ${message}\n`);
  process.exitCode = err && Number.isInteger(err.exitCode) ? err.exitCode : 2;
});
