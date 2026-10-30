# Typed failure and cleanup pattern

Use `AiError` to preserve stable failure classification, explicit retry permission, capacity scope and session usability. An unsuccessful turn does not automatically make its session unusable. Cancellation and host persistence failures never trigger provider failover.

Cleanup uncertainty has priority: `isCleanupIncomplete` recognizes flagged nested causes and aggregates. The affected profile remains blocked until the host can confirm that its native processes have stopped. Surface a safe explanation without serializing raw provider causes.

```typescript
// #region Imports

import { AiError, isCleanupIncomplete } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Produces a safe host-facing failure description without exposing raw causes.
 *
 * @param failure - Native, runtime or host failure.
 * @returns Stable classification and a safe user-facing explanation.
 *
 * @public
 */
export function describeAiFailure(failure: unknown): {
    readonly code: string;
    readonly message: string;
} {
    if (isCleanupIncomplete(failure))
        return {
            code: 'host',
            message: 'Native process termination is unconfirmed; this profile is blocked.',
        };

    if (failure instanceof AiError) return { code: failure.code, message: failure.message };

    return { code: 'host', message: 'The AI operation could not be completed.' };
}
```

Forward only sanitized `AiError.message` values from trusted adapters. Keep `.cause`, CLI stdout/stderr, login fields and native token responses internal. `retryable` alone does not authorize replay: routing additionally requires explicit request repeatability and explicit write-retry permission for writing work.

See [AiError](../packages/synapse-core/api/classes/AiError.md) and [isCleanupIncomplete](../packages/synapse-core/api/functions/isCleanupIncomplete.md).
