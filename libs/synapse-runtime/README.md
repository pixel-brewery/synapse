# @pixel-brewery/synapse-runtime

Run local CLI AI jobs through one owner for processes, profile access, cancellation, bounded events and results. `AiRuntime` composes explicitly selected drivers and isolated instances; `NodeProcessRunner` supplies the native process boundary.

**Initial family version 0.0.1:** install the published package from public GitHub Packages after release verification. [Registry authentication](../../.docs/guides/consumers.md#install-from-github-packages) is required; source-repository access is separate. Requires Node.js 24.15.0 or later and native ESM. Runtime depends on Core, AJV for schema validation and cross-spawn for platform-aware executable resolution. Concrete providers remain separate packages.

`snapshotAiInstance` captures cloneable instance data at runtime/auth boundaries, detaching profile paths, environment and nested configuration from later host mutations.

## Run one native request

This example additionally uses the Auth and Codex packages. It requires an installed Codex CLI and an already authenticated isolated `local-notes`/`personal` profile; [AuthManager](../synapse-auth/README.md) provides the explicit login flow for that profile.

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ProfileManager } from '@pixel-brewery/synapse-auth';
import { CodexDriver } from '@pixel-brewery/synapse-provider-codex';
import { AiRuntime, NodeProcessRunner } from '@pixel-brewery/synapse-runtime';

const profiles = new ProfileManager({ rootDirectory: join(homedir(), '.local-notes', 'synapse') });
const profile = await profiles.create({
    applicationId: 'local-notes',
    accountId: 'personal',
    driverId: 'codex',
});
const driver = new CodexDriver(new NodeProcessRunner());
const runtime = new AiRuntime({
    drivers: [driver],
    instances: [{ id: 'personal', driverId: driver.id, profile }],
});

try {
    const handle = runtime.run({
        target: { instanceId: 'personal' },
        prompt: 'Summarize this transcript: We agreed to publish the draft tomorrow.',
        policy: { mode: 'read-only' },
    });
    console.log((await handle.result).text);
} finally {
    await runtime.dispose();
}
```

Omitting `workingDirectory` gives the job an owned temporary directory, without requiring Git. A supplied workspace stays host-owned. The runtime disposes its registered drivers and optional router, so transfer ownership of those objects to one runtime.

## Execution guarantees

- `events` has one consumer and bounded history; the default capacity is 256 with overflow summaries. `result` completes without consuming it. A critical `onEvent` callback failure cancels the attempt and prevents provider failover.
- `outputSchema` validates the actual result locally, including native structured output. Applications still decode `structured: unknown` into their business model. Unsupported declared execution or permission capabilities reject before native launch; ACP additionally checks negotiated capabilities before submitting a prompt.
- Deadlines include queue time. The default is 30 minutes, with 128 active/queued runs and a 4 MiB prompt budget. Configure a longer bounded deadline for long agent turns; the native timer ceiling is 2,147,483,647 milliseconds.
- `cancel()` and `dispose()` await owned cleanup. An unconfirmed termination remains a `cleanupIncomplete` host failure, blocks that profile and is reported by disposal. Creating replacement state requires the host to confirm its processes have stopped.

`NodeProcessRunner` uses executable/argument vectors and stdin, controlled environments, combined output limits and native process-tree cleanup. Windows support includes `PATH`/`PATHEXT` resolution and command shims. Native permission modes are enforced by the selected CLI, rather than an additional Synapse OS sandbox.

## Profiles and account changes

Pass `runtime.access` to `AuthManager`. `ProfileAccessCoordinator.credentialChange(profile, action)` drains execution and advances the persistent session generation before native credential mutation. `FileProfileSessionStore` also binds explicit configuration/environment sources across restarts using a digest without credential plaintext. Preserve complete session references when persisting continuations.

The coordinator is runtime-local; a host must coordinate access if several processes use the same profile. Imports and constructors start no processes, discovery, timers or login. CLI installation and updates remain explicit host actions.

See the [consumer guide](../../.docs/guides/consumers.md) and [generated API reference](../../.docs/packages/synapse-runtime/api/index.md).
