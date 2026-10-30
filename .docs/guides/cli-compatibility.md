# CLI compatibility and verification evidence

Synapse uses installed executables. Selecting, installing and updating a CLI are explicit host actions. The library does not install a binary, start login or make a network request during import.

## Characterized interfaces

These versions identify the native interfaces used during implementation. They are a starting point for compatibility checks, rather than a promise that every past or future release behaves identically.

| Driver                                                      | Characterized version              | Interface and evidence                                                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Codex](../../libs/synapse-provider-codex/README.md)        | `0.164.0-alpha.11.1`               | Installed help; native `exec` JSON events and login methods; separate metadata inspection using the native app-server interface                                                                      |
| [Claude Code](../../libs/synapse-provider-claude/README.md) | `2.1.287`                          | Installed help; native noninteractive stream, authentication methods and resume arguments                                                                                                            |
| [OpenCode](../../libs/synapse-provider-opencode/README.md)  | `1.18.31`                          | Installed help and the [pinned native run implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/cli/cmd/run.ts); no established OpenCode 2.x compatibility claim |
| [ACP](../../libs/synapse-provider-acp/README.md)            | `@agentclientprotocol/sdk` `2.1.0` | Official SDK with controlled stdio protocol agents; capabilities, session loading and native permission mode IDs depend on the chosen agent                                                          |

Native JSON Schema output is available through the Codex and Claude drivers; runtime validation still checks the final result. OpenCode and ACP results use local validation. Invalid results fail with a typed error instead of becoming an unvalidated success.

Each driver advertises its supported execution policies. For OpenCode and ACP, `allowedTools: []` adds no deny-all tool restriction; see the exact driver contract before using tool restrictions as an application policy. ACP has no universal authenticated-account check or universal read-only mode. The host must supply verified mode mappings and, when needed, a native auth adapter.

## Platform and test evidence

The supported Node baseline is **24.15.0 or later**. Development verification described here ran with **Node.js 24.21.0 on macOS**.

| Area                                          | Current evidence                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source, types, unit/contract tests and builds | Local macOS verification through `yarn verify`                                                                                                                                                                                                                                     |
| Real npm artifacts                            | All nine archives installed in an independent consumer; public exports and NodeNext declarations checked                                                                                                                                                                           |
| Import behavior and modularity                | Inert-import probe, browser-compatible Core bundle and Codex-only esbuild/Rollup bundle checks                                                                                                                                                                                     |
| Independent application                       | Meeting-text example executed against installed archives using explicit simulation                                                                                                                                                                                                 |
| Native Windows and Linux                      | Process resolution/termination paths and fixtures exist; the [CI workflow](../../.github/workflows/ci.yml) configures both platforms. A completed remote matrix run is still required as release evidence                                                                          |
| Provider messages                             | Synthetic successful-turn fixtures plus sanitized real account-free Codex metadata and Claude/OpenCode error recordings, fragmented through real adapters. Their provenance identifies exact CLI versions and isolation; these do not establish successful live-account inference. |
| Live sign-in and inference                    | Explicit meeting-example login followed by `yarn native:verify` for schema output, bound resume, active cancellation, reuse, isolation and optional logout. Account-dependent runs are intentionally outside ordinary CI; see [native verification](native-verification.md).       |
| Symphony integration                          | Local `yarn verify`, `yarn e2e` and `yarn forge:package` passed in the consuming integration worktree; this does not establish every native provider/account combination                                                                                                           |

The Windows implementation includes native executable lookup, command shims, `PATH`/`PATHEXT` handling and owned process-tree termination. Its presence in source and fixtures is distinct from a successful native Windows CI run.

## Real account-free protocol recordings

The following native recordings were captured on macOS with network access, real-home access and Keychain service access denied by an actually checked operating-system sandbox. Only private temporary CLI homes and explicitly synthetic input were supplied. Raw captures and temporary homes were removed after sanitization.

- [Codex metadata provenance](../../libs/synapse-provider-codex/src/metadata/fixtures/PROVENANCE.md): real initialization, model metadata, signed-out account and authentication-required responses; no thread or prompt RPCs.
- [Claude recording provenance](../../libs/synapse-provider-claude/src/adapters/fixtures/PROVENANCE.md): real zero-token offline error frames, including a result with `is_error: true` despite a `success` subtype.
- [OpenCode recording provenance](../../libs/synapse-provider-opencode/src/fixtures/PROVENANCE.md): a real offline native error. This recording does not establish a specific model-not-found classification.

Adjacent replay tests feed fragmented recorded bytes through the actual driver/decoder. Synthetic success fixtures remain separately identified. A successful native account response, resume or sign-in is evidenced only by a separately initiated authenticated check; the [native verification guide](native-verification.md) gives the commands for dedicated test accounts.

## Accounts and data

Profiles separate application and account state. Native login is explicit, uses methods actually advertised by the driver and shares a profile coordinator with execution. Existing credential paths can be mapped deliberately; global credentials are not silently imported.

Subscription access depends on the installed CLI and the account's supported authentication methods. Synapse does not require an API key, provide a token broker, bypass provider terms or make every backend keyless. A CLI running on the local machine may send prompts, files or tool context to remote services under its own configuration and permissions.

## Checking a CLI upgrade

1. Check the actual executable version and native help for execution, login, resume, schema and permission arguments.
2. Add or adjust sanitized transport fixtures in the owning provider package; preserve tests for fragmentation, native errors, cancellation and cleanup.
3. Run the provider's focused Nx targets, then `yarn verify` and `yarn packaging:verify`.
4. Run explicit native sign-in, short execution, resume and cancellation checks with a dedicated application/account profile on the intended operating systems.
5. Record the versions, platform and outcome here and in the owning package README. Preserve failures and untested combinations as such.

See [consumer integration](consumers.md), [contribution guidance](../../CONTRIBUTING.md) and [release preparation](releases.md).
