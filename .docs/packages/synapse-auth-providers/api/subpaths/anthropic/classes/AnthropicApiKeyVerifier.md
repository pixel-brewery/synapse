# Class: AnthropicApiKeyVerifier

Verifies an Anthropic API key through its authenticated, non-inference models endpoint.

## Remarks

Sends one GET to https://api.anthropic.com/v1/models?limit=1 using the documented
2026-10-21 API version and bearer-key authentication. No model generation, catalog export,
billing check or entitlement claim occurs. Keys without permission for this endpoint cannot
be verified by this adapter. Construction and imports perform no credential or network I/O.

## Extends

- [`ApiKeyVerifierBase`](../../../../../synapse-auth/api/classes/ApiKeyVerifierBase.md)

## Constructors

### Constructor

> **new AnthropicApiKeyVerifier**(`_transport?`, `options?`): `AnthropicApiKeyVerifier`

Captures an explicit transport and optional workspace selector.

#### Parameters

##### \_transport?

[`ApiKeyVerificationTransportBase`](../../../classes/ApiKeyVerificationTransportBase.md) = `...`

Bounded verification HTTP owner; defaults to the native Node transport.

##### options?

[`IAnthropicApiKeyVerifierOptions`](../interfaces/IAnthropicApiKeyVerifierOptions.md) = `{}`

Workspace selection matching the host's later inference client.

#### Returns

`AnthropicApiKeyVerifier`

#### Throws

An AiError for an invalid transport or unsafe/unknown workspace options.

#### Overrides

`ApiKeyVerifierBase.constructor`

## Methods

### verify()

> **verify**(`_scope`, `apiKey`, `signal`): `Promise`\<[`IAiAuthStatus`](../../../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Performs one cancellable authentication probe and returns safe verified state.

#### Parameters

##### \_scope

[`IApiKeyCredentialScope`](../../../../../synapse-auth/api/interfaces/IApiKeyCredentialScope.md)

Authorized connection identity; no identity values are sent to Anthropic.

##### apiKey

`string`

Backend-only candidate key supplied by the authentication lifecycle.

##### signal

`AbortSignal`

Bounded caller cancellation checked around the HTTP exchange.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Authenticated state after a valid models page, or false for HTTP 401/403.

#### Throws

An AiError for invalid input, cancellation, rate limiting, provider/network failure
or malformed successful responses. Raw provider bodies and secrets are never returned.

#### Overrides

`ApiKeyVerifierBase.verify`
