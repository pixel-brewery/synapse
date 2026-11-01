# Abstract Class: ApiKeyStoreBase

Backend secret-storage boundary for API-key connections.

## Remarks

The host supplies durable encrypted storage and authorization. No default storage,
encryption key, filesystem path or cloud service is selected by Synapse. Implementations must
scope every operation by the complete identity tuple, honor cancellation before mutation,
atomically replace a key, and preserve the previous key when replacement fails before commit.
The profile coordinator serializes one process; hosts coordinate concurrent backend replicas
through their storage/connection owner. Returned keys are backend-only secrets.

## Constructors

### Constructor

> **new ApiKeyStoreBase**(): `ApiKeyStoreBase`

#### Returns

`ApiKeyStoreBase`

## Methods

### read()

> `abstract` **read**(`scope`, `signal`): `Promise`\<`string` \| `undefined`\>

Resolves one connection's secret without changing persistent state.

#### Parameters

##### scope

[`IApiKeyCredentialScope`](../interfaces/IApiKeyCredentialScope.md)

Complete application/account/provider/instance/profile identity.

##### signal

`AbortSignal`

Bounded caller cancellation.

#### Returns

`Promise`\<`string` \| `undefined`\>

The secret key, or undefined when this connection has no stored key.

#### Throws

An error for storage failure; raw diagnostics must not be sent to a client.

***

### remove()

> `abstract` **remove**(`scope`, `signal`): `Promise`\<`void`\>

Idempotently removes this connection's locally managed secret reference.

#### Parameters

##### scope

[`IApiKeyCredentialScope`](../interfaces/IApiKeyCredentialScope.md)

Complete authorized connection identity.

##### signal

`AbortSignal`

Cancellation that must be checked before the storage commit.

#### Returns

`Promise`\<`void`\>

Completion after this connection's key is absent.

#### Throws

An error when removal cannot commit.

#### Remarks

Removing a stored key does not revoke the original key at the provider.

***

### write()

> `abstract` **write**(`scope`, `apiKey`, `signal`): `Promise`\<`void`\>

Atomically stores a verified key for exactly one connection.

#### Parameters

##### scope

[`IApiKeyCredentialScope`](../interfaces/IApiKeyCredentialScope.md)

Complete authorized connection identity.

##### apiKey

`string`

Secret verified by the selected backend verifier; never log it.

##### signal

`AbortSignal`

Cancellation that must be checked before the storage commit.

#### Returns

`Promise`\<`void`\>

Completion after the replacement has committed.

#### Throws

An error when replacement cannot commit; preserve the previous secret.
