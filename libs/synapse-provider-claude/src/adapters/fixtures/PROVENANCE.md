# Native protocol fixture

Synthetic, sanitized protocol replay based on Symphony native adapter tests and the characterized Claude Code 2.1.287 print stream-json contract. Identifiers, prompts, paths, tool bodies and token values are invented. This is not a claim that a personal-account inference was recorded. The actual adapter and JSON-lines decoder consume these frames; only the external subprocess boundary is simulated.

## Actual offline native error recording

`native-offline-error.json` was recorded from installed **Claude Code 2.1.287** on **2026-10-29**, macOS arm64. It contains the actual process stdout/stderr and exit code 1. The existing `native-turn.jsonl` above remains synthetic.

The recording used a dedicated temporary HOME, working directory, CLAUDE_CONFIG_DIR and CLAUDE_SECURESTORAGE_CONFIG_DIR. It did **not** call `prepareClaudeHome` or link native OS keychain paths. A macOS sandbox denied all networking, real-home reads/writes, and securityd/secd Mach lookup; a preceding home/TCP/Mach canary verified these restrictions without reading credentials or modifying the probe file.

The native arguments were:

```text
--bare --print --input-format text --output-format stream-json --verbose
--permission-mode plan --tools '' --strict-mcp-config
--mcp-config '{"mcpServers":{}}' --disable-slash-commands
--model synapse-offline-fixture
```

`--bare` is deliberate for this account-free recording: it disables keychain/OAuth reads. Production subscription execution continues to use safe mode. The environment supplied only a declared synthetic API key, `ANTHROPIC_BASE_URL=http://127.0.0.1:9`, zero requested retries, disabled telemetry/error reporting/nonessential traffic/auto-updater, and isolated process paths. The OS network denial remained authoritative regardless of those settings. The prompt was the fixed synthetic text “Return the word fixture. This is an offline protocol recording.” No public endpoint, personal account, login/logout or model inference was used.

The four genuine frames include UI invalidation, initialization, a local API-error message and a final result with `subtype: "success"` **and** `is_error: true`. Its terminal reason is `api_error`; token counts and cost are zero. This proves an actual offline error shape, not successful authentication, inference or resume.

Temporary paths, generated session/message UUIDs and the timestamp were replaced with fixed values; remaining protocol fields/order and native EPERM error were retained. JSON lines were re-encoded. The adjacent real driver spec fragments these messages at the external transport boundary; an explicitly identified zero-exit fault-injection case checks that the error flag still wins. No synthetic success fixture was replaced.
