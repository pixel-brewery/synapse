# @pixel-brewery/synapse-provider-opencode

Bring installed OpenCode CLI sessions into a local Node.js application, using native provider accounts, isolated state and Synapse's common result/event contracts.

This adapter fits applications that need OpenCode's native provider/model selection or a deliberately configured compatible endpoint. The host chooses its provider catalog and account policy; Synapse does not promise a login method for every provider available to OpenCode.

## Installation and requirements

Requires **Node.js 24.15+**, ESM and an installed OpenCode CLI. The package never installs a CLI, gateway or provider plugin during import.

The initial family version is **0.0.1**, published through public GitHub Packages after release verification. Configure [registry authentication](../../.docs/guides/consumers.md#install-from-github-packages) before installation; native AI sign-in remains separate. Local evaluation can use [verified archives](../../.docs/guides/consumers.md#local-archive-alternative). Install the verified published version with:

```sh
yarn add @pixel-brewery/synapse-provider-opencode@0.0.1 @pixel-brewery/synapse-runtime@0.0.1 @pixel-brewery/synapse-auth@0.0.1
```

## Compose a runtime

This example selects the native `openai` provider account. Complete authentication in the isolated profile first; choose a configured model through the request's `model` or the instance's `configuration.model` when the native profile has no default.

```ts
import { resolve } from 'node:path';
import { ProfileManager } from '@pixel-brewery/synapse-auth';
import { AiRuntime, NodeProcessRunner } from '@pixel-brewery/synapse-runtime';
import {
    OpenCodeDriver,
    type IOpenCodeConfiguration,
} from '@pixel-brewery/synapse-provider-opencode';

const profiles = new ProfileManager({
    rootDirectory: resolve('.local-ai-profiles'),
});
const profile = await profiles.create({
    applicationId: 'meeting-assistant',
    accountId: 'personal',
    driverId: 'opencode',
});
const driver = new OpenCodeDriver(new NodeProcessRunner());
const configuration = { providerId: 'openai' } satisfies IOpenCodeConfiguration;
const instance = {
    id: 'opencode-personal',
    driverId: driver.id,
    profile,
    configuration,
};
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

Set `instance.executable` to select an installed binary outside `PATH`. Omitted `workingDirectory` gives a text request its own temporary workspace without requiring Git. The run handle also offers a bounded event iterable; result completion does not depend on consuming it. Runtime disposal drains the registered driver and its process runner.

## Capabilities

| Capability         | Behavior                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Execution          | Native `--pure run --format json`; the prompt is sent on stdin.                              |
| Read-only requests | Native `plan` agent plus denied shell, editing, subagent and external-directory permissions. |
| Writing requests   | Native `build` agent plus explicit native tool/command permissions.                          |
| Streaming          | Normalized messages, reasoning, bounded tool labels, sessions and usage snapshots.           |
| Structured results | Agent text is JSON Schema-validated locally by `AiRuntime`; no native schema-output switch.  |
| Resume             | Native `--session`, guarded by the runtime's complete binding.                               |
| Models             | Request model overrides instance configuration; native reasoning variants are supported.     |
| Inspection         | Stored-credential presence and advertised native `provider/model` identifiers.               |
| Cancellation       | Shared bounded process owner, deadline, cancellation and awaited disposal.                   |

For JSON results, ask for JSON in your prompt and supply `outputSchema`. Synapse validates the returned value; it does not invent native structured-output support. Usage snapshots accumulate completed native steps and suppress repeated part IDs; replace previous snapshots when displaying totals.

## Native configuration and authentication

`instance.configuration` accepts the fields described by `IOpenCodeConfiguration`:

| Setting             | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `providerId`        | Exact native provider key for account status, login and logout.                  |
| `authMethod`        | Exact native method label for that provider; required to advertise login.        |
| `model` / `variant` | Fallback native model and reasoning variant; request values take precedence.     |
| `deniedCommands`    | Native shell permission patterns such as `git push*`.                            |
| `gateway`           | Explicit compatible endpoint configuration; no endpoint is installed by Synapse. |

Discover login procedures with `driver.auth.methods(instance)`. The driver advertises **`native`** only when both `providerId` and `authMethod` are configured. The method uses `auth login --provider … --method …`; the exact provider method label must come from the installed CLI's supported procedures.

Use `AuthManager` from `@pixel-brewery/synapse-auth` with **`runtime.access`**, then explicitly call `auth.start(instance, driver.auth, { ownerId, methodId: 'native' })`. Your host presents correlated browser/terminal interactions and submits requested native input. Dispose the auth manager on shutdown. The [authentication guide](../../.docs/guides/consumers.md#explicit-authentication) covers response ownership and execution draining.

Status combines native `auth list` with bounded profile-owned credential data, keyed by stable provider ID. It establishes stored-credential presence, not remote token validity or subscription entitlement. Synapse requires no API key; the actual login options and account terms belong to the selected native provider.

Each profile owns HOME, XDG paths, configuration and session state. Existing global credentials are never discovered automatically. The public `importOpenCodeCredentials(sourceFile, instance)` helper performs an explicit point-in-time copy. Run it inside `runtime.access.credentialChange(instance.profile, action)` so current executions drain and persisted session generations invalidate before mutation.

An optional `IOpenCodeGateway` can describe a host-selected compatible endpoint. Supply only the credential environment **name** in its configuration; the credential value remains in the instance environment. The host still owns endpoint trust, account policy and its visible model catalog.

## Policy and session boundaries

Pure mode and isolated environment settings disable ambient project configuration, external plugins, automatic updates, sharing and snapshots. Subagent and external-directory permissions are denied. Read-only requests additionally deny shell execution and edits.

Tool filters use native permission names such as `read` or `bash`; unsupported syntax fails before launch. A **nonempty** `allowedTools` array restricts other tools, while `deniedTools` denies named permissions. An empty `allowedTools` array currently adds no restriction; it is not a deny-all setting. Use explicit native permissions appropriate to the selected operation.

Persist the complete session reference from events or `result.session`, including its authentication generation. Pass it as `session` on the next request. Keep account and candidate binding intact; the core session codec supports hosts with string storage. See [persisted sessions](../../.docs/guides/consumers.md#persisted-sessions).

Application prompts, tracker behavior, worktrees and commit/push approval remain host responsibilities. Writing retries require explicit authorization. Raw shell payloads, tool inputs/results and native credential values are not public progress.

## Compatibility and verification

The characterized CLI is **OpenCode 1.18.31**. Stdin and native login selectors were checked against installed help and the [pinned native run implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/cli/cmd/run.ts). The primary CLI reference is [OpenCode CLI documentation](https://opencode.ai/docs/cli/).

Synthetic, sanitized replays exercise the actual adapter's fragmented output, sessions, cumulative usage, native errors, permissions and stored-account selection. Local validation has run on **macOS with Node.js 24**. The Node 24 CI matrix targets macOS, Linux and native Windows; its configuration alone does not establish a completed remote run. Live account/login compatibility needs an explicitly initiated integration check.

## Documentation and license

- [Consumer guide](../../.docs/guides/consumers.md)
- [Generated provider API](../../.docs/packages/synapse-provider-opencode/api/index.md)
- [Authentication API](../../.docs/packages/synapse-auth/api/index.md)
- [Runtime API](../../.docs/packages/synapse-runtime/api/index.md)

MIT. Native execution/isolation patterns were adapted from Symphony; the packaged `LICENSE` retains copyright 2026 RueDeRennes and Symphony contributors.

A real sandboxed offline error is replayed separately from the synthetic successful-turn messages; see [recording provenance](src/fixtures/PROVENANCE.md). Account-dependent execution/resume checks use the explicit [native verifier](../../.docs/guides/native-verification.md).
