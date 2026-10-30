# @pixel-brewery/synapse-auth

Keep native CLI accounts separate for each application and account, then manage explicit login, status and logout through the same profile gate as execution. Native provider sign-in supplies credentials; this package requires no API key and adds no token broker.

**Initial family version 0.0.1:** install the published package from public GitHub Packages after release verification. [Registry authentication](../../.docs/guides/consumers.md#install-from-github-packages) is required; source-repository access is separate. Requires Node.js 24.15.0 or later and native ESM. Auth depends on Core and Runtime; the host selects a provider authentication driver.

## Connect an isolated account

This example uses an installed Codex CLI and prints its native browser sign-in URL. The profile matches the [Runtime example](../synapse-runtime/README.md). A host that also runs jobs passes the same `access` into `AiRuntime`.

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AuthManager, ProfileManager } from '@pixel-brewery/synapse-auth';
import { CodexDriver } from '@pixel-brewery/synapse-provider-codex';
import { NodeProcessRunner, ProfileAccessCoordinator } from '@pixel-brewery/synapse-runtime';

const profiles = new ProfileManager({ rootDirectory: join(homedir(), '.local-notes', 'synapse') });
const profile = await profiles.create({
    applicationId: 'local-notes',
    accountId: 'personal',
    driverId: 'codex',
});
const access = new ProfileAccessCoordinator();
const authentication = new AuthManager(access);
const driver = new CodexDriver(new NodeProcessRunner());
const instance = { id: 'personal', driverId: driver.id, profile };

try {
    const method = driver.auth.methods(instance).find((entry) => entry.kind === 'browser');
    if (!method) throw new Error('This driver has no native browser sign-in method.');
    const login = authentication.start(instance, driver.auth, {
        ownerId: 'settings-window',
        methodId: method.id,
    });
    for await (const state of login.events) {
        if (state.state === 'waiting' && state.interaction.url) {
            console.log('Open this sign-in URL:', state.interaction.url);
        }
    }
    console.log('Authenticated:', (await login.result).authenticated);
} finally {
    const cleanup = await Promise.allSettled([authentication.dispose(), driver.dispose()]);
    const failures = cleanup
        .filter((outcome) => outcome.status === 'rejected')
        .map((outcome) => outcome.reason);
    if (failures.length)
        throw new AggregateError(failures, 'Native authentication cleanup failed.');
}
```

For device, terminal or credential interactions, present the driver's declared fields and call `login.respond({ ownerId, operationId, interactionId, values })` with the current identifiers from the waiting state. Keep input values private. Expired, stale, duplicate and wrong-owner responses are rejected. A host UI owns its interaction lifetime and cancellation.

## Lifecycle and isolation

`login.state` is authoritative; bounded event history can drop older snapshots. `login.result` completes independently of observation and succeeds only after a separate native status check. Default login lifetime is five minutes and status checks have a five-second deadline; both are configurable within the documented bounds.

Starting login or logout blocks new execution for that profile, cancels/drains affected work and serializes credential changes. Replacement login waits for the old native flow to stop. `status()` never initiates login; `logout()` verifies signed-out state. Authentication captures a detached instance snapshot before gate acquisition, so later caller configuration changes cannot redirect native work to another account. Share **one coordinator** with execution, and await cancellation/disposal. Unconfirmed process cleanup takes precedence over cancellation, keeps the profile blocked and makes `cancel()`/`dispose()` reject after cleanup attempts settle.

Account changes persist a fresh session generation before mutating native credentials. Failed metadata persistence prevents the mutation. Explicit credential imports use the same `access.credentialChange(profile, action)` path; a generic exclusive lock alone does not invalidate old sessions. Persist full runtime-created references, including their original generation.

`ProfileManager.create()` derives stable paths from application/driver/account identifiers. Optional `id` and `paths` retain existing native directories and configuration identity without importing global credentials. Persistent ownership markers cover every native directory across managers; bounded ancestor/descendant checks reject conflicting mappings while preserving explicit legacy spellings. Failed initialization keeps established reservations for identical retry. This is not a cross-process scheduler.

Owned directories/markers use 0700/0600 on POSIX. Windows hosts must choose an account-private storage base with appropriate inherited ACLs. Native temporary directories use short profile-specific paths for Unix socket limits. Imports and constructors are inert; explicit profile creation and account operations perform the work.

See the [consumer and session guide](../../.docs/guides/consumers.md) and [generated API reference](../../.docs/packages/synapse-auth/api/index.md).
