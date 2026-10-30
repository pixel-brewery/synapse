# Class: AiError

Stable failure with explicit retry and session recovery semantics.

## Extends

- `Error`

## Constructors

### Constructor

> **new AiError**(`code`, `message`, `options?`): `AiError`

Creates a safe failure; raw causes remain internal diagnostic material.

#### Parameters

##### code

[`AiErrorCode`](../type-aliases/AiErrorCode.md)

Stable failure classification.

##### message

`string`

Safe host-facing explanation.

##### options?

[`IAiErrorOptions`](../interfaces/IAiErrorOptions.md) = `{}`

Recovery metadata and optional internal cause.

#### Returns

`AiError`

#### Remarks

Unconfirmed process cleanup, including a flagged nested cause, always forces host classification, disables retries and marks the session unusable.

#### Overrides

`Error.constructor`

## Properties

### capacityScope?

> `readonly` `optional` **capacityScope?**: `"account"` \| `"model"`

Explicit provider-reported capacity scope, if known.

***

### cleanupIncomplete

> `readonly` **cleanupIncomplete**: `boolean`

Whether native process termination remains unconfirmed; affected profile execution and credential changes must remain blocked.

***

### code

> `readonly` **code**: [`AiErrorCode`](../type-aliases/AiErrorCode.md)

Stable provider-neutral failure classification.

***

### retryable

> `readonly` **retryable**: `boolean`

Whether an explicitly repeatable operation may retry this failure.

***

### retryAt?

> `readonly` `optional` **retryAt?**: `number`

Optional UTC epoch-millisecond recovery instant.

***

### sessionUsable

> `readonly` **sessionUsable**: `boolean`

Whether the originating native session remains usable.
