# Recorded account-free Codex metadata

`native-account-free.json` contains stdout, stderr and exit status from the installed **Codex CLI 0.164.0-alpha.11.1**, recorded on **2026-10-29**, macOS arm64. These are actual native messages, not generated success frames.

The native process ran in a dedicated temporary HOME/CODEX_HOME and empty working directory under macOS `sandbox-exec`. The profile denied all network activity, reads/writes under the real home, and `com.apple.securityd` / `com.apple.secd` Mach lookup. A preceding canary verified blocked home read, blocked write-only open without modifying the probe file, blocked local TCP connection and both denied Mach lookups (1100). No credentials, login, logout or inference were used.

## Native interaction

The executable received `app-server --listen stdio://`, with hooks, plugins, apps, multi-agent features and notifications disabled through the same configuration arguments used by the metadata inspector. The recorder sent:

1. `initialize` (id 1), then `initialized`.
2. `model/list` (id 2, limit 100, includeHidden false).
3. `account/rateLimits/read` (id 3).
4. `account/usage/read` (id 4).
5. `account/read` (id 5, refreshToken false).

No thread/session/prompt method was sent. The six messages include initialization, a disabled remote-control notification, eight native model descriptions, two authentication-required errors and `account: null`. The recorder stopped the process after all five replies; the process exited with code 0. This is metadata/protocol evidence, not authenticated usage, successful inference or resumed work.

## Sanitization and replay

Temporary paths, OS hostname, installation UUID and emission timestamp were replaced with fixed anonymous values. Native field names, types, message order, model entries and error messages were retained; JSON lines were re-encoded after value sanitization. No real-home, account or credential value remains.

The adjacent inspector spec replays this stdout in 17-character fragments through the real metadata inspector, with only the external process boundary substituted. The extra account-read reply and native notification are retained as genuine unrelated messages. Synthetic metadata cases remain separately constructed in that spec; the execution package's `adapters/fixtures/native-turn.jsonl` remains explicitly synthetic.
