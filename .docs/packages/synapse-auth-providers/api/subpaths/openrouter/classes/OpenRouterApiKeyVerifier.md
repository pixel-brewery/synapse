# Class: OpenRouterApiKeyVerifier

Verifies an OpenRouter key through its authenticated current-key metadata endpoint.

## Remarks

This adapter performs one fixed HTTPS GET to /api/v1/key and never invokes a model,
changes a key or requests management privileges. Success establishes metadata access only;
it does not promise a remaining budget, model access or inference permission. Provider key
labels, balances and raw responses are not returned as account metadata.

## Extends

- [`ApiKeyVerifierBase`](../../../../../synapse-auth/api/classes/ApiKeyVerifierBase.md)

## Constructors

### Constructor

> **new OpenRouterApiKeyVerifier**(`_transport?`): `OpenRouterApiKeyVerifier`

Captures the HTTP boundary without reading a credential or starting network work.

#### Parameters

##### \_transport?

[`ApiKeyVerificationTransportBase`](../../../classes/ApiKeyVerificationTransportBase.md) = `...`

Explicit request boundary; defaults to bounded public HTTPS transport.

#### Returns

`OpenRouterApiKeyVerifier`

#### Overrides

`ApiKeyVerifierBase.constructor`

## Methods

### verify()

> **verify**(`_scope`, `apiKey`, `signal`): `Promise`\<[`IAiAuthStatus`](../../../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Checks whether OpenRouter accepts the key for authenticated key metadata.

#### Parameters

##### \_scope

[`IApiKeyCredentialScope`](../../../../../synapse-auth/api/interfaces/IApiKeyCredentialScope.md)

Authorized connection identity; the host selects this adapter for its provider.

##### apiKey

`string`

Backend-only OpenRouter key, sent only in the Authorization header.

##### signal

`AbortSignal`

Caller cancellation combined with the transport's bounded deadline.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Safe authentication status; 401/403 leave the credential unverified.

#### Throws

An AiError for invalid input, cancellation, timeout, rate limit, network or malformed response.

#### Overrides

`ApiKeyVerifierBase.verify`
