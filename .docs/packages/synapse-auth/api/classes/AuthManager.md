# Class: AuthManager

Coordinates native account changes with the same profile gate used by execution.

## Remarks

Construction is inert. Explicit starts/status/logout create bounded operations;
event consumption never controls completion. Reuse one manager for a host runtime.

## Constructors

### Constructor

> **new AuthManager**(`coordinator`, `options?`): `AuthManager`

Captures lifecycle policy without accessing files, credentials or native CLIs.

#### Parameters

##### coordinator

[`ProfileAccessCoordinator`](../../../synapse-runtime/api/classes/ProfileAccessCoordinator.md)

Exact access coordinator shared with AiRuntime.

##### options?

[`IAuthManagerOptions`](../interfaces/IAuthManagerOptions.md) = `{}`

Bounded lifetimes, event capacity and deterministic clock/ID seams.

#### Returns

`AuthManager`

#### Throws

An AiError when a configured limit is invalid.

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Cancels all login/status/logout work and awaits owned native cleanup.

#### Returns

`Promise`\<`void`\>

Idempotent shutdown completion; future operations are rejected.

#### Throws

An AiError with cleanupIncomplete after all cleanup attempts settle if termination remains unconfirmed.

***

### logout()

> **logout**(`configuration`, `driver`, `signal?`): `Promise`\<`void`\>

Cancels/drains a profile's login and executions before removing its native credentials.

#### Parameters

##### configuration

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Account whose credentials are explicitly being removed; snapshotted before reserving its profile.

##### driver

[`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md)

Native logout/status implementation.

##### signal?

`AbortSignal`

Optional caller cancellation, still awaited through native cleanup.

#### Returns

`Promise`\<`void`\>

Completion after native logout and verification that the account is signed out.

#### Throws

An AiError for timeout, cancellation, teardown failure or persistent authentication.

***

### start()

> **start**(`configuration`, `driver`, `options`): [`IAuthHandle`](../interfaces/IAuthHandle.md)

Starts one explicit login, cancelling and draining any older login for that profile.

#### Parameters

##### configuration

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Isolated account instance; paths and options are snapshotted before reserving its profile.

##### driver

[`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md)

Native authentication implementation selected by the host.

##### options

[`IAuthStartOptions`](../interfaces/IAuthStartOptions.md)

Authorized response owner, advertised method and optional lifetime/signal.

#### Returns

[`IAuthHandle`](../interfaces/IAuthHandle.md)

Current state, bounded events and the same login's verified result.

#### Throws

An AiError for disposal, invalid/unsupported configuration or the active-operation limit.

#### Remarks

Profile admission is blocked synchronously. A new login waits for prior native teardown.

***

### status()

> **status**(`configuration`, `driver`, `signal?`): `Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Performs a bounded native status check without initiating login, hooks or inference.

#### Parameters

##### configuration

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Selected isolated account, snapshotted before acquiring its execution lease.

##### driver

[`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md)

Read-only native authentication inspector.

##### signal?

`AbortSignal`

Optional caller cancellation.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Validated safe account metadata, without raw CLI messages.

#### Throws

An AiError for busy profiles, timeout, cancellation or inspection failure; unconfirmed cleanup leaves the profile blocked.
