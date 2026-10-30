# @pixel-brewery/synapse-routing

Choose among host-authorized CLI AI accounts while controlling queues, concurrency, account pauses and provider circuits. `AiRouter` implements the Core routing contract; applications supply eligible instances, model choices and cost/quality policy.

**Initial family version 0.0.1:** install the published package from public GitHub Packages after release verification. [Registry authentication](../../.docs/guides/consumers.md#install-from-github-packages) is required; source-repository access is separate. Requires Node.js 24.15.0 or later and native ESM. Routing depends only on Core. Runtime and concrete drivers are composed by the consumer.

## Route a repeatable text job

The caller supplies two distinct, authenticated profiles/instances and their drivers. This function owns and disposes the composed runtime, drivers and router:

```ts
import type { AiDriverBase, IAiInstance } from '@pixel-brewery/synapse-core';
import { AiRouter, MemoryRoutingStore } from '@pixel-brewery/synapse-routing';
import { AiRuntime } from '@pixel-brewery/synapse-runtime';

async function summarize(
    drivers: readonly AiDriverBase[],
    primary: IAiInstance,
    backup: IAiInstance,
    prompt: string,
): Promise<string> {
    const router = new AiRouter({
        store: new MemoryRoutingStore(),
        routes: [
            {
                id: 'summary',
                scopeId: 'local-notes',
                strategy: 'priority',
                maxParallelExecutions: 1,
                maxQueuedExecutions: 32,
                candidates: [
                    { id: 'primary', instanceId: primary.id, accountId: primary.profile.accountId },
                    { id: 'backup', instanceId: backup.id, accountId: backup.profile.accountId },
                ],
            },
        ],
    });
    const runtime = new AiRuntime({ drivers, instances: [primary, backup], router });
    try {
        const result = await runtime.run({
            target: { routeId: 'summary' },
            prompt,
            policy: { mode: 'read-only', repeatable: true },
        }).result;
        return result.text;
    } finally {
        await runtime.dispose();
    }
}
```

A route shares its bounded concurrency/queue budget across all backup candidates. Deadlines include waiting time, and cancellation removes queued work. Selection supports priority and host-supplied quality, cost, latency, reliability and usage evidence, with stable input-order ties. Complete strategy values are in the API reference.

For a long-lived application, reuse one composed runtime/router so requests share admission and telemetry state.

## Replay is an explicit policy

Automatic failover requires a retryable typed provider failure and `policy.repeatable: true`; writing jobs additionally require `allowWriteRetry: true`. Cancellation, timeout, host/persistence errors and unconfirmed cleanup stop failover. A paused account or authoritative unavailable-model result can be skipped before any native attempt without replay permission.

Sessions remain bound to their selected candidate/instance/profile. Matching session affinity is opt-in; a different fallback receives no foreign continuation. Capacity pauses require `AiError.capacityScope === 'account'`, so a model-only rate limit does not pause every candidate for that account. Optional `providerId` groups provider-wide circuit evidence without turning one account's auth failure into a provider outage.

## Storage and ownership

`MemoryRoutingStore` is bounded local state. Extend `RoutingStoreBase` to use the host's durable persistence owner; records are versioned and timestamps use UTC epoch milliseconds. Unknown versions and storage failures reject without deleting state or running another provider. Queues are runtime-local, and Synapse adds no shared background service.

`RouteGovernor`, `RouteAdmission`, `AccountCooldowns` and `ModelAvailabilityCache` can also be composed individually. Dispose the router to abort and await its queued/active operations; durable state and explicitly shared model caches remain host-owned. Imports and constructors perform no I/O.

The routing algorithms originate in Symphony under MIT; the shipped license retains the original attribution. See the [consumer guide](../../.docs/guides/consumers.md) and [generated API reference](../../.docs/packages/synapse-routing/api/index.md).
