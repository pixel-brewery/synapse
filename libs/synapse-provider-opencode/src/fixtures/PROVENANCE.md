# OpenCode protocol fixtures

## Synthetic successful turn

`opencode-stream.ndjson` is the existing synthetic, sanitized stream used to exercise text, reasoning, tool labels and cumulative usage. Its invented session, content and token values are not an actual account recording.

## Actual offline native error

`native-offline-error.json` contains real stdout/stderr and exit code 1 from installed **OpenCode 1.18.31**, recorded on **2026-10-29**, macOS arm64. It was produced by:

```text
opencode --pure run --format json --model __synapse_missing__/__missing__
  --agent plan --dir <temporary-workspace>
```

The process had a private temporary HOME, XDG directories, cache, configuration and working directory. `OPENCODE_AUTH_CONTENT={}` supplied no credentials. Inline configuration disabled auto-updates, sharing, snapshots and all tool permissions. Environment settings disabled model-catalog fetch, auto-updates, project configuration, Claude integration and external skill discovery; pure mode disabled external plugins. The installed executable's model-fetch implementation explicitly returns an empty catalog when `OPENCODE_DISABLE_MODELS_FETCH` is set.

A macOS sandbox additionally denied every network operation, real-home read/write and securityd/secd Mach lookup. Before the recording, a local canary verified those restrictions without reading credentials or modifying the probe file. No personal account, login/logout, public endpoint or inference was used. The supplied prompt was fixed synthetic recording text.

The native output is one generic `UnknownError` frame with a native error reference. Selecting an unknown model under this sandbox did **not** produce a specific ModelNotFoundError, so this fixture makes no model-resolution guarantee. It records the actual offline failure, not a successful turn, authentication or resume.

The generated session ID, error reference and timestamp were replaced with fixed anonymous values. Field names/types, native error message and message order were retained, and JSON was re-encoded. The adjacent real OpenCode driver spec consumes this frame in seven-character fragments with only the subprocess boundary substituted. The synthetic success fixture remains separate.
