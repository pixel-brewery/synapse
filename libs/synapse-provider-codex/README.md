# @pixel-brewery/synapse-provider-codex

Run installed Codex CLI sessions from your own Node.js application, using an isolated account, streamed progress and typed results. Native ChatGPT sign-in works without making an API key a Synapse requirement.

This driver fits local assistants, text processing and repository workflows that need Codex's native sandbox, sessions and model metadata. Your application supplies prompts, workspaces and approval policy.

## Installation and requirements

Requires **Node.js 24.15+**, ESM and an installed Codex CLI. Synapse never installs or updates the CLI.

The initial family version is **0.0.1**, published through public GitHub Packages after release verification. Configure [registry authentication](../../.docs/guides/consumers.md#install-from-github-packages) before installation; native AI sign-in remains separate. Local evaluation can use [verified archives](../../.docs/guides/consumers.md#local-archive-alternative). Install the verified published version with:

```sh
yarn add @pixel-brewery/synapse-provider-codex@0.0.1 @pixel-brewery/synapse-runtime@0.0.1 @pixel-brewery/synapse-auth@0.0.1
```

## Compose a runtime

Sign in to the selected isolated profile before executing the example. A login in your ordinary Codex home is not automatically imported; see [Authentication and profiles](#authentication-and-profiles).

```ts
import { resolve } from 'node:path';
import { ProfileManager } from '@pixel-brewery/synapse-auth';
import { AiRuntime, NodeProcessRunner } from '@pixel-brewery/synapse-runtime';
import { CodexDriver } from '@pixel-brewery/synapse-provider-codex';

const profiles = new ProfileManager({
    rootDirectory: resolve('.local-ai-profiles'),
});
const profile = await profiles.create({
    applicationId: 'meeting-assistant',
    accountId: 'personal',
    driverId: 'codex',
});
const driver = new CodexDriver(new NodeProcessRunner());
const instance = { id: 'codex-personal', driverId: driver.id, profile };
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

The host owns the profile root. Text requests without `workingDirectory` receive an owned temporary workspace and need no Git repository. Set `instance.executable` when the selected CLI is outside `PATH`.

`runtime.run()` also returns a bounded `events` iterable. Consuming it is optional; the same handle's `result` completes independently. Imports and driver construction start no processes or login flows. Runtime disposal drains its registered driver and the driver's injected runner.

## Capabilities

| Capability         | Behavior                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Execution          | Native `codex exec --json`; prompts go through stdin.                                             |
| Filesystem policy  | Native `read-only` and `workspace-write` sandbox settings.                                        |
| Streaming          | Normalized text, reasoning, safe tool/file-change progress, session and usage events.             |
| Structured results | Native JSON Schema output, followed by local `AiRuntime` validation.                              |
| Resume             | Native Codex session, checked against the runtime's complete ownership binding.                   |
| Model selection    | Request-level model and reasoning effort.                                                         |
| Metadata           | Native model/default/reasoning descriptions, capacity windows and optional credits/account usage. |
| Cancellation       | Shared process owner enforces cancellation, deadlines and output limits.                          |
| Tool filters       | Per-tool allowlists and nonempty denylists are unsupported and rejected.                          |

Set `outputSchema` for structured results. Decode the resulting `structured` value into your application's domain after Synapse validates it. Usage events are cumulative snapshots for the turn; replace the previous snapshot instead of adding them together.

## Authentication and profiles

Use `AuthManager` from `@pixel-brewery/synapse-auth`, constructed with **the same `runtime.access`** coordinator. Discover procedures with `driver.auth.methods(instance)`, then explicitly start the chosen procedure with `auth.start(instance, driver.auth, { ownerId, methodId })`.

| Method ID         | Native interaction                                            |
| ----------------- | ------------------------------------------------------------- |
| `chatgpt-browser` | Browser sign-in through native `codex login`.                 |
| `chatgpt-device`  | Native device-code sign-in.                                   |
| `api-key`         | Explicit credential input sent to native login through stdin. |
| `access-token`    | Explicit access-token input sent through stdin.               |

Present the flow's correlated browser/device/credential interactions in your host and await its verified `result`. Input responses carry owner, operation and interaction IDs. Dispose the auth manager at application shutdown. The [consumer guide](../../.docs/guides/consumers.md#explicit-authentication) explains this shared lifecycle; inspection and execution never silently begin login.

Profiles separate application and account identity. Codex credentials live under the selected `profile.paths.credentials`; execution uses owned snapshots in `profile.paths.execution/codex`, with a separate metadata home. Native refreshes are committed only when their original credential baseline still matches. Logout removes owned snapshots. Unconfirmed native process cleanup blocks refresh commits and further profile work.

Existing installations can supply explicit path mappings to `ProfileManager`; Synapse never searches global CLI credentials for you. Do not reuse one profile for unrelated applications or accounts.

## Sessions and execution policy

Keep the complete `result.session` or session event, including `authenticationGeneration`, and pass it as the next request's `session`. Persist the reference with the core package's `encodeSessionReference` / `parseSessionReference` helpers when storage accepts only strings. Native IDs alone lose account and candidate binding. See [persisted sessions](../../.docs/guides/consumers.md#persisted-sessions).

Execution disables ambient hooks, plugins, notifications and project MCP servers. Synapse does not supply business prompts, install MCP servers or approve repository delivery actions. Writing requests use `mode: 'workspace-write'`; automatic replay additionally requires the host's explicit retry policy. A critical `onEvent` persistence failure does not replay native work.

`inspect()` uses bounded app-server stdio RPC without opening an agent thread. Its `ICodexInspection` preserves provider-specific usage details. Unsupported optional usage endpoints degrade to safe categories; malformed required model metadata fails explicitly. Your host owns the visible model catalog and entitlement decisions.

## Compatibility and verification

The characterized CLI is **Codex 0.164.0-alpha.11.1**. Its installed help informed the argument/auth contracts; adjacent tests replay explicitly synthetic native frames through the real adapter and exercise profile refresh, interruption and cleanup behavior.

Local validation has run on **macOS with Node.js 24**. The repository's Node 24 CI configuration targets macOS, Linux and native Windows; configured jobs are not evidence of a completed remote matrix run. Live account sign-in and inference require separately initiated integration checks. New CLI releases should be checked against these contracts before adoption.

## Documentation and license

- [Consumer guide](../../.docs/guides/consumers.md)
- [Generated provider API](../../.docs/packages/synapse-provider-codex/api/index.md)
- [Authentication API](../../.docs/packages/synapse-auth/api/index.md)
- [Runtime API](../../.docs/packages/synapse-runtime/api/index.md)

MIT. Native argument, profile, progress and metadata patterns were adapted from Symphony; the packaged `LICENSE` retains copyright 2026 RueDeRennes and Symphony contributors. Business prompts and workflows remain in the consuming application.

Real account-free metadata recordings complement those synthetic turn fixtures; see [recording provenance](src/metadata/fixtures/PROVENANCE.md). Successful account inference/resume is checked explicitly through the [native verification command](../../.docs/guides/native-verification.md).
