# Abstract Class: ApiKeyVerifierBase

Backend adapter that verifies an API key using the host's selected provider client.

## Remarks

A stored string or a matching key prefix is not verified authentication. Implementations
must perform a bounded, non-inference authentication check, honor cancellation and return only
safe account metadata. Provider endpoints, HTTP policy, SDK dependencies and authorization
remain with the injected adapter. Verification does not prove access to every model or budget.
No model invocation, streaming implementation or provider SDK is supplied by this contract.

## Constructors

### Constructor

> **new ApiKeyVerifierBase**(): `ApiKeyVerifierBase`

#### Returns

`ApiKeyVerifierBase`

## Methods

### verify()

> `abstract` **verify**(`scope`, `apiKey`, `signal`): `Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Checks this connection's candidate secret without storing it or invoking a model.

#### Parameters

##### scope

[`IApiKeyCredentialScope`](../interfaces/IApiKeyCredentialScope.md)

Complete authorized connection identity used to select provider policy.

##### apiKey

`string`

Backend-only candidate key; never return or log it.

##### signal

`AbortSignal`

Bounded cancellation supplied by the authentication lifecycle.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Safe status for the selected authentication check. Authenticated false means that
access could not be verified; a restricted key is not necessarily an invalid key.

#### Throws

An error for cancellation, provider or transport failure.
