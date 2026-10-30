# @pixel-brewery/synapse-provider-claude

Use installed Claude Code from a local Node.js application with native account sign-in, isolated profiles and one streaming execution contract. Synapse supports subscription authentication without requiring an API key.

Choose this driver for Claude Code's native tools, permission modes, resumable sessions and JSON Schema output. Your host supplies prompts, business approvals and repository ownership.

## Installation and requirements

Requires **Node.js 24.15+**, ESM and an installed Claude Code CLI. Installation and CLI updates remain explicit host actions.

The initial family version is **0.0.1**, published through public GitHub Packages after release verification. Configure [registry authentication](../../.docs/guides/consumers.md#install-from-github-packages) before installation; native AI sign-in remains separate. Local evaluation can use [verified archives](../../.docs/guides/consumers.md#local-archive-alternative). Install the verified published version with:

```sh
yarn add @pixel-brewery/synapse-provider-claude@0.0.1 @pixel-brewery/synapse-runtime@0.0.1 @pixel-brewery/synapse-auth@0.0.1
```

## Compose a runtime

Complete native sign-in for this isolated profile before running the request. Credentials from your ordinary Claude Code profile are not imported automatically.

```ts
import { resolve } from 'node:path';
import { ProfileManager } from '@pixel-brewery/synapse-auth';
import { AiRuntime, NodeProcessRunner } from '@pixel-brewery/synapse-runtime';
import { ClaudeDriver } from '@pixel-brewery/synapse-provider-claude';

const profiles = new ProfileManager({
    rootDirectory: resolve('.local-ai-profiles'),
});
const profile = await profiles.create({
    applicationId: 'meeting-assistant',
    accountId: 'personal',
    driverId: 'claude',
});
const driver = new ClaudeDriver(new NodeProcessRunner());
const instance = { id: 'claude-personal', driverId: driver.id, profile };
const runtime = new AiRuntime({ drivers: [driver], instances: [instance] });

try {
    const result = await runtime.run({
        target: { instanceId: instance.id },
        prompt: 'Summarize this transcript: We agreed to publish the draft tomorrow.',
        policy: { mode: 'read-only' },
    }).result;

    console.log(result.text);
} finally {
    await runtime.dispose();
}
```

No Git repository is required for a text request. When `workingDirectory` is omitted, the runtime owns a temporary workspace. Set `instance.executable` to select a specific installed binary.

The returned handle also exposes bounded `events`; `result` does not depend on consuming them. Driver import/construction performs no discovery, login or inference. Disposing the runtime drains its registered driver and injected runner.

## Capabilities

| Capability         | Behavior                                                                               |
| ------------------ | -------------------------------------------------------------------------------------- |
| Execution          | Native print mode with stdin text and `stream-json` output.                            |
| Read-only requests | Native `plan` permission mode; conflicting explicit tool allowlists are rejected.      |
| Writing requests   | Native `acceptEdits` mode; host-supplied tool/command restrictions remain explicit.    |
| Streaming          | Text, reasoning, bounded tool/file-change labels, sessions and cumulative usage.       |
| Structured results | Native `--json-schema`, followed by local runtime validation.                          |
| Resume             | Native `--resume` with complete runtime session binding.                               |
| Model/effort       | Request model and supported effort values forwarded to the CLI.                        |
| Tool filters       | Native tool surface, allow rules and deny patterns; an empty allowlist disables tools. |
| Inspection         | Native account status; no fabricated model-list endpoint.                              |
| Cancellation       | Shared process cancellation, output limits, deadlines and awaited disposal.            |

Set `outputSchema` for schema-validated results and decode `result.structured` into your business type. Token usage events replace earlier cumulative snapshots.

## Authentication and account isolation

Create `AuthManager` from `@pixel-brewery/synapse-auth` using **`runtime.access`**, then select a method advertised by `driver.auth.methods(instance)`:

| Method ID      | Native procedure                     |
| -------------- | ------------------------------------ |
| `subscription` | Claude subscription browser sign-in. |
| `console`      | Anthropic Console browser sign-in.   |
| `sso`          | Native SSO browser sign-in.          |

Start the selected method explicitly with `auth.start(instance, driver.auth, { ownerId, methodId })`. Your host presents the correlated browser interaction and supplies an authorization code only when the native flow requests it. The manager verifies native status before reporting success, coordinates login/logout with execution, and must be disposed at shutdown. See [explicit authentication](../../.docs/guides/consumers.md#explicit-authentication).

An explicitly supplied `instance.environment.ANTHROPIC_API_KEY` is also supported by the native CLI. It is optional and does not create another Synapse login method. Credential values belong in host-provided secret handling, not application logs or prompts.

Each application/account profile has its own HOME, configuration, temporary paths and native secure-storage identity. On macOS, the adapter exposes existing OS login-keychain routing to the isolated HOME while `CLAUDE_SECURESTORAGE_CONFIG_DIR` separates native account services; credential values and global Claude configuration are not copied. Other platforms use isolated configuration without that macOS path preparation. Explicit legacy path mappings preserve existing profile identity.

## Tool and session boundaries

Execution uses native **safe mode**, which preserves OAuth while disabling ambient customizations. MCP configuration is explicitly empty; slash commands are disabled. The adapter's read-only policy is the CLI's permission mode, not an additional Synapse OS sandbox.

`allowedTools` restricts both the actual `--tools` surface and native allow rules. Read-only allowlists accept only read/search/fetch tools. `deniedTools` passes native deny patterns such as `Bash(git push:*)`. In writing mode, the default explicitly approved tools include Bash, WebFetch and WebSearch; select tighter host rules when the application requires them. Shell commands and raw tool input/result bodies are excluded from public progress.

Keep complete session references from events or `result.session`, including `authenticationGeneration`, and submit them as the next request's `session`. Persist opaque strings through the core session codec when needed. Account/configuration transitions invalidate older bindings. See [persisted sessions](../../.docs/guides/consumers.md#persisted-sessions).

Business prompts, worktree creation, commit/push rules and result presentation stay in your host. Writing retries require explicit host authorization; a critical event-persistence failure does not cause provider replay.

## Compatibility and verification

The characterized CLI is **Claude Code 2.1.287**. Installed help and native argument/auth behavior informed this adapter. Synthetic protocol replays exercise the real decoder, structured output, session resume, tool restrictions and application/account separation without personal AI accounts.

Local checks have run on **macOS with Node.js 24**. The configured CI matrix targets macOS, Linux and native Windows with Node 24; it does not establish that a remote matrix run or live subscription test has completed. Run explicit account/CLI integration checks for the versions and platforms you deploy.

## Documentation and license

- [Consumer guide](../../.docs/guides/consumers.md)
- [Generated provider API](../../.docs/packages/synapse-provider-claude/api/index.md)
- [Authentication API](../../.docs/packages/synapse-auth/api/index.md)
- [Runtime API](../../.docs/packages/synapse-runtime/api/index.md)

MIT. Native argument, profile and progress patterns were adapted from Symphony. The packaged `LICENSE` retains copyright 2026 RueDeRennes and Symphony contributors.

The adjacent [provenance](src/adapters/fixtures/PROVENANCE.md) also documents a real sandboxed offline error recording, separately from synthetic successful turns. Use [native verification](../../.docs/guides/native-verification.md) for an explicitly prepared private test account.
