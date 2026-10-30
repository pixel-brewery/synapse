# Interface: IAuthHandle

One login's current state, bounded history and awaited native completion.

## Properties

### events

> `readonly` **events**: `AsyncIterable`\<[`AuthState`](../type-aliases/AuthState.md)\>

Bounded snapshots; result completion never depends on consuming this iterable.

***

### result

> `readonly` **result**: `Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Resolves only after native login and status verification; rejects after cleanup on failure.

***

### state

> `readonly` **state**: [`AuthState`](../type-aliases/AuthState.md)

Authoritative latest snapshot even when older events were dropped.

## Methods

### cancel()

> **cancel**(): `Promise`\<`void`\>

Cancels this flow and waits for native teardown, including queued starts.

#### Returns

`Promise`\<`void`\>

Completion after all owned login work has settled.

#### Throws

An AiError with cleanupIncomplete when native process termination remains unconfirmed.

***

### respond()

> **respond**(`response`): `void`

Provides in-memory input to the current owner-scoped interaction.

#### Parameters

##### response

[`IAiAuthResponse`](../../../synapse-core/api/interfaces/IAiAuthResponse.md)

Current owner, operation, interaction and submitted input values.

#### Returns

`void`

#### Throws

An AiError for stale, expired, invalid or unauthorized responses.
