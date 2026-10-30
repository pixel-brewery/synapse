# Class: ProfileAccessCoordinator

Shared admission/drain owner for execution and native credential transitions.

## Remarks

Unconfirmed native cleanup blocks the affected profile for this coordinator's lifetime. The host must confirm process termination before replacing the coordinator; there is no automatic reset or credential mutation after failed drain.

## Constructors

### Constructor

> **new ProfileAccessCoordinator**(`_drainTimeoutMs?`, `_maximumProfiles?`, `_sessionStore?`): `ProfileAccessCoordinator`

Creates an inert profile gate, shared by one runtime and its authentication manager.

#### Parameters

##### \_drainTimeoutMs?

`number` = `5_000`

Maximum wait for active execution cleanup, default 5 seconds.

##### \_maximumProfiles?

`number` = `4096`

Maximum simultaneously active or switching profiles, default 4096.

##### \_sessionStore?

[`ProfileSessionStoreBase`](ProfileSessionStoreBase.md) = `...`

Persistent session ownership metadata; accessed only during explicit operations.

#### Returns

`ProfileAccessCoordinator`

#### Throws

An AiError for invalid resource budgets.

## Methods

### bindSession()

> **bindSession**(`instance`): `Promise`\<`string` \| `undefined`\>

Binds explicit credential/configuration sources under a drained exclusive transition.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Instance whose stable native configuration is being prepared.

#### Returns

`Promise`\<`string` \| `undefined`\>

Current generation after invalidating continuations affected by changed configuration.

#### Throws

An AiError without changing native credentials when metadata persistence fails or the gate is not held.

***

### credentialChange()

> **credentialChange**\<`T`\>(`profile`, `action`, `signal?`): `Promise`\<`T`\>

Drains execution, persists a new generation and only then invokes a native credential change.

#### Type Parameters

##### T

`T`

Native authentication operation result.

#### Parameters

##### profile

[`IAiProfile`](../../../synapse-core/api/interfaces/IAiProfile.md)

Isolated account being changed.

##### action

() => `Promise`\<`T`\>

Mutation invoked after successful generation persistence.

##### signal?

`AbortSignal`

Optional cancellation checked before persistence and before native mutation.

#### Returns

`Promise`\<`T`\>

The mutation result after releasing the profile gate.

#### Throws

An AiError on cancellation, drain or persistence failure; the mutation is not started in those cases.

#### Remarks

A failed or cancelled native login still invalidates older sessions once a transition started.

***

### enter()

> **enter**(`profileId`, `abort`): (`error?`) => `void`

Acquires an execution lease unless authentication currently owns the profile.

#### Parameters

##### profileId

`string`

Stable application/account profile identity.

##### abort

() => `void`

Synchronous cancellation initiation; the caller releases after awaited cleanup.

#### Returns

Idempotent release function. Pass a failed cleanup error to block future profile work; omit it only after confirmed process termination.

(`error?`) => `void`

#### Throws

An AiError when the profile is switching or the active-profile budget is exhausted.

***

### exclusive()

> **exclusive**\<`T`\>(`profileId`, `action`, `signal?`): `Promise`\<`T`\>

Blocks admission, cancels/drains active leases and serializes credential changes.

#### Type Parameters

##### T

`T`

Native authentication/credential transition outcome.

#### Parameters

##### profileId

`string`

Profile whose credentials are changing.

##### action

() => `Promise`\<`T`\>

Runs only after prior transitions and active execution have ended.

##### signal?

`AbortSignal`

Optional transition cancellation, checked before any credential mutation.

#### Returns

`Promise`\<`T`\>

Result after the exclusive transition finishes.

#### Throws

An AiError when cancellation initiation fails, the transition is cancelled or execution fails to drain within the budget. Unconfirmed cleanup keeps the profile blocked.

***

### invalidateSessions()

> **invalidateSessions**(`profile`): `Promise`\<`string`\>

Invalidates continuations before a native account or credential mutation.

#### Parameters

##### profile

[`IAiProfile`](../../../synapse-core/api/interfaces/IAiProfile.md)

Profile whose exclusive drained gate is held by the caller.

#### Returns

`Promise`\<`string`\>

Fresh persisted generation; existing references retain their previous generation.

#### Throws

An AiError on missing exclusivity or persistence failure.

***

### sessionGeneration()

> **sessionGeneration**(`profile`): `Promise`\<`string` \| `undefined`\>

Reads the authentication generation while the caller holds an execution lease or exclusive transition.

#### Parameters

##### profile

[`IAiProfile`](../../../synapse-core/api/interfaces/IAiProfile.md)

Explicit application/account owner.

#### Returns

`Promise`\<`string` \| `undefined`\>

Current generation, or undefined for preserved pre-transition legacy state.

#### Throws

An AiError if persisted metadata cannot be trusted.
