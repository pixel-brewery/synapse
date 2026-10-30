# Schema-validated host result pattern

Applications own their result schemas and domain projections. Set `outputSchema` on `IAiRequest`; the runtime validates the actual final JSON even when the provider supports native structured output. `IAiResult.structured` remains `unknown` until the application narrows its own result shape.

```typescript
// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { AiRuntime } from '@pixel-brewery/synapse-runtime';

// #endregion

/**
 * Requests and narrows one application-owned summary result.
 *
 * @param runtime - Explicitly composed runtime.
 * @param instanceId - Authorized isolated account instance.
 * @param transcript - Application-supplied text.
 * @param signal - Caller cancellation.
 * @returns The schema-validated summary string.
 * @throws An AiError for malformed output or execution failure.
 *
 * @public
 */
export async function readSummary(
    runtime: AiRuntime,
    instanceId: string,
    transcript: string,
    signal: AbortSignal,
): Promise<string> {
    const result = await runtime.run({
        target: { instanceId },
        prompt: `Summarize this transcript accurately. Return a JSON object with summary.\n\n${transcript}`,
        policy: { mode: 'read-only' },
        outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary'],
            properties: { summary: { type: 'string', minLength: 1 } },
        },
        signal,
        deadline: Date.now() + 30_000,
    }).result;
    const value = result.structured;

    if (
        typeof value === 'object' &&
        value !== null &&
        'summary' in value &&
        typeof value.summary === 'string'
    )
        return value.summary;

    throw new AiError('result-validation', 'The summary result does not match the host contract.');
}
```

Keep every host interface `I`-prefixed and document its public fields. Use explicit narrowing or an application-owned schema decoder rather than asserting arbitrary provider JSON into a domain type. Invalid JSON and schema failures remain typed result-validation errors.

See [IAiResult](../packages/synapse-core/api/interfaces/IAiResult.md) and the [independent meeting-text example](../../apps/meeting-notes/README.md).
