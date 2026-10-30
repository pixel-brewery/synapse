# Bounded AI request pattern

A query is a host-composed `IAiRequest` submitted to an explicitly configured runtime instance. The host owns the prompt, eligible instance, model selection, deadline and repeatability. Query helpers return the final result of the same execution; consuming its event stream is optional.

Put the following helper in `summarizeText.ts`. It assumes that the host has already composed the runtime and explicitly prepared the selected account.

```typescript
// #region Imports

import type { IAiResult } from '@pixel-brewery/synapse-core';
import type { AiRuntime } from '@pixel-brewery/synapse-runtime';

// #endregion

/**
 * Submits one bounded read-only text request to a host-selected account.
 *
 * @param runtime - Explicitly composed runtime and provider instances.
 * @param instanceId - Host-authorized account instance.
 * @param text - Transcribed text supplied by the application.
 * @param signal - Caller cancellation.
 * @returns The actual provider result after owned cleanup.
 *
 * @public
 */
export async function summarizeText(
    runtime: AiRuntime,
    instanceId: string,
    text: string,
    signal: AbortSignal,
): Promise<IAiResult> {
    return runtime.run({
        target: { instanceId },
        prompt: `Summarize the supplied transcript without inventing facts.\n\n${text}`,
        policy: { mode: 'read-only' },
        deadline: Date.now() + 30_000,
        signal,
    }).result;
}
```

An optional model name identifies an AI model selected by the host. Requested output fields belong in an application-owned JSON Schema. Explicit `repeatable` and writing retry permissions belong to routing policy; helpers do not infer them from a prompt.

See [consumer composition](../guides/consumers.md) and [AiRuntime](../packages/synapse-runtime/api/classes/AiRuntime.md).
