# Class: CodexAuthDriver

Native Codex login procedures scoped to one application's account profile.

## Extends

- [`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md)

## Constructors

### Constructor

> **new CodexAuthDriver**(`_runner`): `CodexAuthDriver`

Creates an inert authentication adapter.

#### Parameters

##### \_runner

[`ProcessRunnerBase`](../../../synapse-runtime/api/classes/ProcessRunnerBase.md)

Explicit subprocess boundary shared with this Codex driver's executions.

#### Returns

`CodexAuthDriver`

#### Overrides

`AiAuthDriverBase.constructor`

## Methods

### login()

> **login**(`context`): `Promise`\<`void`\>

Runs one explicitly chosen native login; the shared auth owner verifies status afterward.

#### Parameters

##### context

[`IAiAuthContext`](../../../synapse-core/api/interfaces/IAiAuthContext.md)

Isolated, expiring operation and correlated user interactions.

#### Returns

`Promise`\<`void`\>

Completion after native login exits and owned process cleanup finishes.

#### Throws

An AiError for unsupported methods, invalid credentials or native failure.

#### Overrides

`AiAuthDriverBase.login`

***

### logout()

> **logout**(`instance`, `signal`): `Promise`\<`void`\>

Signs out only this account and removes its owned execution credential snapshots.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Isolated native credential owner.

##### signal

`AbortSignal`

Logout cancellation, controlled by the shared auth lifecycle.

#### Returns

`Promise`\<`void`\>

Completion after native logout and owned snapshot cleanup.

#### Throws

An AiError when native logout or local cleanup fails.

#### Overrides

`AiAuthDriverBase.logout`

***

### methods()

> **methods**(`_instance`): readonly [`IAiAuthMethod`](../../../synapse-core/api/interfaces/IAiAuthMethod.md)[]

Describes the native procedures supported by the characterized Codex CLI.

#### Parameters

##### \_instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Selected account; no state is read during method discovery.

#### Returns

readonly [`IAiAuthMethod`](../../../synapse-core/api/interfaces/IAiAuthMethod.md)[]

Browser, device code and stdin-based API/access-token procedures.

#### Overrides

`AiAuthDriverBase.methods`

***

### status()

> **status**(`instance`, `signal`): `Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Checks only native login status, without inference, hooks or a login attempt.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Isolated native credential owner.

##### signal

`AbortSignal`

Bounded caller cancellation.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Safe verified native authentication state.

#### Overrides

`AiAuthDriverBase.status`
