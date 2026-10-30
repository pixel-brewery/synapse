# Interface: IAiErrorOptions

Recovery information that never turns host failure into a retryable provider error.

## Properties

### capacityScope?

> `readonly` `optional` **capacityScope?**: `"account"` \| `"model"`

Explicit capacity scope; an unscoped/model-only failure must not pause an entire account.

***

### cause?

> `readonly` `optional` **cause?**: `unknown`

Internal cause for diagnostics; consumers must redact before serialization.

***

### cleanupIncomplete?

> `readonly` `optional` **cleanupIncomplete?**: `boolean`

True when owned process termination could not be confirmed. Forces a nonretryable host failure and unusable session; inherited flagged causes cannot be cleared by false.

***

### retryable?

> `readonly` `optional` **retryable?**: `boolean`

Whether this provider failure may be retried when host policy also permits it.

***

### retryAt?

> `readonly` `optional` **retryAt?**: `number`

Optional absolute UTC epoch milliseconds after a quota/cooldown expires.

***

### sessionUsable?

> `readonly` `optional` **sessionUsable?**: `boolean`

Whether a failed turn left the same native session usable; default true.
