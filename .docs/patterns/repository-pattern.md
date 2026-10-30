# Host-owned persistence pattern

Synapse's replaceable persistence seams are `RoutingStoreBase` and `ProfileSessionStoreBase`. An application can inject its durable storage through those documented contracts. Synapse does not own the application's database or business repositories.

Read and write versioned, complete snapshots within the owning host's transaction boundary. Preserve unsupported schema versions, distinguish an absent record from a failed read, and propagate critical failures. A result-persistence failure must never trigger another provider execution.

The following helper reads the real routing contract through an injected store:

```typescript
// #region Imports

import type { IRouteTelemetry, RoutingStoreBase } from '@pixel-brewery/synapse-routing';

// #endregion

/**
 * Reads one host-scoped candidate history through the configured persistence owner.
 *
 * @param store - Host-selected routing persistence implementation.
 * @param scopeId - Application routing namespace.
 * @param candidateId - Explicit candidate identity.
 * @returns Persisted history, or undefined when no record exists.
 * @throws The storage failure when the read cannot complete.
 *
 * @public
 */
export function readCandidateHistory(
    store: RoutingStoreBase,
    scopeId: string,
    candidateId: string,
): IRouteTelemetry | undefined {
    return store.loadTelemetry(scopeId, 'candidate', candidateId);
}
```

A host adapter extending `RoutingStoreBase` implements every telemetry, cooldown and removal method. `MemoryRoutingStore` is the bounded in-process implementation for hosts that do not need persistence. `FileProfileSessionStore` is the default persisted account/session binding owner; it stores configuration digests and generations without copying credential plaintext into routing data.

Native sessions retain their complete `IAiSessionReference`. Persist it with `encodeSessionReference` and recover it with `parseSessionReference`; never attach current account identifiers to an arbitrary old native ID.

See [RoutingStoreBase](../packages/synapse-routing/api/classes/RoutingStoreBase.md) and [persisted sessions](../guides/consumers.md#persisted-sessions).
