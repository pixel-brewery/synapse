# Provider normalization and host projection pattern

Drivers normalize native CLI frames into `AiEvent`, `IAiUsage`, typed failures and one `IAiDriverResult`. The runtime binds native session IDs to the actual driver, profile, instance, candidate and authentication generation. Vendor payloads and reusable credentials stay within the adapter boundary.

Applications make their own domain projections from these neutral values. This pure helper formats an already normalized usage snapshot:

```typescript
// #region Imports

import type { IAiUsage } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Projects the latest cumulative native usage snapshot into host-owned text.
 *
 * @param usage - Latest normalized usage for one execution.
 * @returns A presentation label without vendor payloads or credential data.
 *
 * @public
 */
export function usageLabel(usage: IAiUsage): string {
    return `${usage.input} input, ${usage.output} output, ${usage.total} total tokens`;
}
```

Usage events represent the latest cumulative snapshot; replace the previous snapshot rather than summing every event. Preserve unknown account/model availability as unknown instead of manufacturing entitlement. Preserve typed host and cleanup failures when mapping errors so routing cannot mistake them for safely retryable provider failures.

An entity name and response name supplied to the mapping tool describe a host application's projection. They do not create additional shared domain types or a global mapping registry.

See [IAiUsage](../packages/synapse-core/api/interfaces/IAiUsage.md) and [provider-neutral contracts](../architecture/synapse.md).
