# Explicit runtime composition pattern

A Synapse module is an application-owned composition boundary. Import only the selected provider packages, inject their process runner, configure isolated instances and share one profile coordinator between execution and authentication. Constructors and imports perform no native execution or login.

The host can accept already constructed drivers and instances without maintaining a provider registry:

```typescript
// #region Imports

import { AuthManager } from '@pixel-brewery/synapse-auth';
import type { AiDriverBase, IAiInstance } from '@pixel-brewery/synapse-core';
import { AiRuntime } from '@pixel-brewery/synapse-runtime';

// #endregion

/**
 * Composes execution and native authentication over one shared profile gate.
 *
 * @param drivers - Explicit provider implementations selected by the host.
 * @param instances - Isolated application/account configurations.
 * @returns Runtime, authentication owner and an explicit shutdown function.
 *
 * @public
 */
export function composeAi(
    drivers: readonly AiDriverBase[],
    instances: readonly IAiInstance[],
): {
    readonly runtime: AiRuntime;
    readonly auth: AuthManager;
    readonly dispose: () => Promise<void>;
} {
    const runtime = new AiRuntime({ drivers, instances });
    const auth = new AuthManager(runtime.access);

    return {
        runtime,
        auth,
        dispose: async () => {
            const outcomes = await Promise.allSettled([auth.dispose(), runtime.dispose()]);
            const failures = outcomes
                .filter((outcome) => outcome.status === 'rejected')
                .map((outcome) => outcome.reason);

            if (failures.length) throw new AggregateError(failures, 'AI shutdown failed.');
        },
    };
}
```

The provider driver owns disposal of its injected runner according to its contract. A host sharing runners across additional capabilities also awaits those owners explicitly. All shutdown attempts settle before an aggregated failure is reported.

`moduleName` names the host's composition unit; optional `bases` refer to actual runtime seams such as `AiDriverBase`, `ProcessRunnerBase` or a documented persistence base. They do not introduce implicit framework registration.

See [minimal native consumer](../guides/consumers.md#a-minimal-native-consumer) and [runtime lifecycle](../architecture/streaming.md).
