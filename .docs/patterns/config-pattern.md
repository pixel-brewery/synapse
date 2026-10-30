# Explicit profile and instance configuration pattern

Configuration is host-supplied typed data. Keep application, account, driver implementation and configured instance identities distinct. `ProfileManager` prepares separate home/configuration/credential/session locations. Native account changes use the same `ProfileAccessCoordinator` as execution.

This host factory creates a profile explicitly without logging in or inspecting a global account:

```typescript
// #region Imports

import { ProfileManager } from '@pixel-brewery/synapse-auth';
import type { IAiInstance } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Prepares one explicitly owned application/account profile.
 *
 * @param manager - Host-configured profile manager with an owned absolute store root.
 * @param applicationId - Application namespace.
 * @param accountId - Host account identity.
 * @param driverId - Open implementation ID registered by the host.
 * @returns A configured instance awaiting explicit native authentication.
 *
 * @public
 */
export async function createAccountInstance(
    manager: ProfileManager,
    applicationId: string,
    accountId: string,
    driverId: string,
): Promise<IAiInstance> {
    const profile = await manager.create({ applicationId, accountId, driverId });

    return { id: profile.id, driverId, profile };
}
```

Read environment variables only at the host bootstrap boundary and pass optional secrets explicitly. Native CLI login methods are selected from the actual driver's advertised procedures. API keys are optional host inputs and are not required by the library.

Use `runtime.configureInstance` for an explicit account/configuration replacement. It drains existing execution and binds the new persisted configuration generation. Wrap direct native credential imports in `runtime.access.credentialChange`; a plain exclusive lock does not invalidate old sessions.

See [explicit authentication](../guides/consumers.md#explicit-authentication) and [ProfileManager](../packages/synapse-auth/api/classes/ProfileManager.md).
