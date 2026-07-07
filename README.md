# claude-p

Cross-platform `claude -p` style wrapper that drives interactive Claude Code through a PTY. The child process uses the local Claude Code login unless provider API environment variables are explicitly preserved.

```sh
claude-p "Respond exactly: CLAUDE_P_OK"
claude-p --output-format json "Summarize this repo"
claude-p --output-format stream-json --model sonnet "Explain quicksort"
```

## Why

Official SDK/API mode can consume API credits. This wrapper launches interactive `claude` instead and strips `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_BASE_URL` by default.

Use `--preserve-provider-env` only when you intentionally want the child `claude` process to see those variables.

## Diagnostics

```sh
claude-p --doctor
```
