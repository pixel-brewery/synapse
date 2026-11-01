# Class: OpenAiApiKeyVerifier

Verifies an OpenAI API key through its authenticated, non-inference models endpoint.

## Remarks

Sends one GET to https://api.openai.com/v1/models without generating tokens or
returning the model catalog. Acceptance proves access to this endpoint only; it does not
establish model entitlement, billing readiness or available budget. A restricted key without
model-list permission cannot be verified by this adapter. Keys remain backend-only secrets.
Imports and construction neither access credentials nor perform network I/O.

## Extends

- [`ApiKeyVerifierBase`](../../../../../synapse-auth/api/classes/ApiKeyVerifierBase.md)

## Constructors

### Constructor

> **new OpenAiApiKeyVerifier**(`_transport?`, `options?`): `OpenAiApiKeyVerifier`

Captures an explicit transport and optional organization/project selectors.

#### Parameters

##### \_transport?

[`ApiKeyVerificationTransportBase`](../../../classes/ApiKeyVerificationTransportBase.md) = `...`

Bounded verification HTTP owner; defaults to the native Node transport.

##### options?

[`IOpenAiApiKeyVerifierOptions`](../interfaces/IOpenAiApiKeyVerifierOptions.md) = `{}`

Optional fixed OpenAI selectors, matching the host's inference client.

#### Returns

`OpenAiApiKeyVerifier`

#### Throws

An AiError for an invalid transport or unsafe/unknown header options.

#### Overrides

`ApiKeyVerifierBase.constructor`

## Methods

### verify()

> **verify**(`_scope`, `apiKey`, `signal`): `Promise`\<[`IAiAuthStatus`](../../../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Performs one cancellable authentication probe and returns safe verified state.

#### Parameters

##### \_scope

[`IApiKeyCredentialScope`](../../../../../synapse-auth/api/interfaces/IApiKeyCredentialScope.md)

Authorized connection identity; no identity values are sent to OpenAI.

##### apiKey

`string`

Backend-only candidate API key supplied by the authentication lifecycle.

##### signal

`AbortSignal`

Bounded caller cancellation, checked before and after the HTTP exchange.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Authenticated state after a valid models response, or false for HTTP 401/403.

#### Throws

An AiError for invalid input, cancellation, rate limiting, provider/network failure
or malformed successful responses. Error messages contain no provider payload or key.

#### Overrides

`ApiKeyVerifierBase.verify`
