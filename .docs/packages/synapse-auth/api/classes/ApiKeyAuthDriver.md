# Class: ApiKeyAuthDriver

Authenticates backend-owned API-key connections without a CLI or inference driver.

## Remarks

Use through AuthManager so credential changes share its profile gate, expiry and
correlated input lifecycle. The host injects authorized secret storage and a bounded provider
verifier. Construction and method discovery perform no I/O. Keys never enter instance options,
public status, progress or error causes. No provider SDK, HTTP client or model call is included.

## Extends

- [`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md)

## Constructors

### Constructor

> **new ApiKeyAuthDriver**(`_store`, `_verifier`): `ApiKeyAuthDriver`

Captures explicit backend adapters without reading credentials or contacting a provider.

#### Parameters

##### \_store

[`ApiKeyStoreBase`](ApiKeyStoreBase.md)

Host-owned encrypted storage, isolated by the complete connection scope.

##### \_verifier

[`ApiKeyVerifierBase`](ApiKeyVerifierBase.md)

Host-owned non-inference provider authentication check.

#### Returns

`ApiKeyAuthDriver`

#### Throws

An AiError when either adapter lacks a required operation.

#### Overrides

`AiAuthDriverBase.constructor`

## Methods

### login()

> **login**(`context`): `Promise`\<`void`\>

Requests one secret, verifies it and atomically replaces only this connection's stored key.

#### Parameters

##### context

[`IAiAuthContext`](../../../synapse-core/api/interfaces/IAiAuthContext.md)

Expiring owner-scoped credentials interaction supplied by AuthManager.

#### Returns

`Promise`\<`void`\>

Completion after verification and the storage commit.

#### Throws

An AiError for unsupported methods, invalid input, rejected keys, cancellation or storage failure.

#### Remarks

Invalid input, rejected verification and cancellation before storage leave the
previous key intact. AuthManager performs a final status check after this method completes.
Input is trimmed at its edges, limited to 65,536 characters and rejects remaining whitespace
or ASCII control characters. The credentials interaction expires after five minutes, further
bounded by AuthManager's operation expiry. Store implementations must honor cancellation at
their atomic commit boundary.

#### Overrides

`AiAuthDriverBase.login`

***

### logout()

> **logout**(`instance`, `signal`): `Promise`\<`void`\>

Removes only this connection's stored key after AuthManager drains affected work.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Authorized connection whose complete identity selects the stored secret.

##### signal

`AbortSignal`

Bounded cancellation checked before the host storage commit.

#### Returns

`Promise`\<`void`\>

Completion after the scoped secret is absent.

#### Throws

An AiError for cancellation or storage failure.

#### Remarks

This removes local access to the key; it does not revoke the key at its provider.

#### Overrides

`AiAuthDriverBase.logout`

***

### methods()

> **methods**(`instance`): readonly [`IAiAuthMethod`](../../../synapse-core/api/interfaces/IAiAuthMethod.md)[]

Advertises explicit secret input for one authorized backend connection.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Connection identity; no credential or provider state is inspected.

#### Returns

readonly [`IAiAuthMethod`](../../../synapse-core/api/interfaces/IAiAuthMethod.md)[]

The API-key credentials procedure with method ID api-key.

#### Throws

An AiError when the connection identity is invalid.

#### Overrides

`AiAuthDriverBase.methods`

***

### status()

> **status**(`instance`, `signal`): `Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Rechecks the stored key with the injected provider verifier without invoking a model.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Authorized connection whose complete identity selects the secret.

##### signal

`AbortSignal`

Bounded caller cancellation supplied by AuthManager.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Safe verified account metadata, or authenticated false when absent or rejected.

#### Throws

An AiError for cancellation, storage failure or malformed/provider verification.

#### Remarks

A stored key alone is never reported as verified authentication.

#### Overrides

`AiAuthDriverBase.status`
