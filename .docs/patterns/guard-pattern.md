# Capability and execution policy guard pattern

The host authorizes business actions. Synapse enforces the selected driver's declared native execution capabilities before starting provider work. Missing read-only policy, unsupported tool restrictions or foreign native session ownership cause explicit failures.

An application can apply this guard when assembling an allowed instance:

```typescript
// #region Imports

import { AiError, type AiDriverBase, type IAiPolicy } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Requires an actually advertised native execution mode.
 *
 * @param driver - Host-selected provider implementation.
 * @param mode - Business-authorized execution mode.
 * @returns An explicit policy without implicit replay authorization.
 * @throws An AiError when the driver cannot enforce that mode.
 *
 * @public
 */
export function requireMode(driver: AiDriverBase, mode: IAiPolicy['mode']): IAiPolicy {
    if (!driver.capabilities.modes.includes(mode))
        throw new AiError('unsupported', 'The selected driver cannot enforce the required mode.');

    return { mode };
}
```

The runtime performs its own guard at execution; a host preview check does not replace that boundary. An empty `allowedTools` list is not a universal deny-all guarantee. Tool restrictions depend on the documented native adapter. ACP additionally verifies negotiated session capabilities and a host-trusted native mode mapping before submitting a prompt.

Preserve the complete bound session reference on resume. Account changes invalidate its authentication generation, and foreign driver/profile/instance/candidate references fail before native execution.

See [IAiPolicy](../packages/synapse-core/api/interfaces/IAiPolicy.md) and [CLI capability evidence](../guides/cli-compatibility.md).
