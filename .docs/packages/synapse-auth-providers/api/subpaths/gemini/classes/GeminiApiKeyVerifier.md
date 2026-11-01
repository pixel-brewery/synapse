# Class: GeminiApiKeyVerifier

Verifies Gemini Developer API credentials through its authenticated metadata endpoint.

## Remarks

Performs only GET /v1beta/models with a single-item page and a secret header.
Authorization keys and supported standard keys use the same header; key prefixes are not
treated as evidence of validity. A successful metadata check establishes credential acceptance
at that endpoint, not project tier, billing status, model entitlement or inference availability.
Vertex AI credentials and OAuth flows are outside this verifier's contract.

## Extends

- [`ApiKeyVerifierBase`](../../../../../synapse-auth/api/classes/ApiKeyVerifierBase.md)

## Constructors

### Constructor

> **new GeminiApiKeyVerifier**(`_transport?`): `GeminiApiKeyVerifier`

Captures the bounded HTTPS transport without reading credentials or contacting Google.

#### Parameters

##### \_transport?

[`ApiKeyVerificationTransportBase`](../../../classes/ApiKeyVerificationTransportBase.md) = `...`

Injected verification transport; defaults to the inert Node HTTPS adapter.

#### Returns

`GeminiApiKeyVerifier`

#### Overrides

`ApiKeyVerifierBase.constructor`

## Methods

### verify()

> **verify**(`_scope`, `apiKey`, `signal`): `Promise`\<[`IAiAuthStatus`](../../../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Checks one explicitly supplied key without generating content or returning model data.

#### Parameters

##### \_scope

[`IApiKeyCredentialScope`](../../../../../synapse-auth/api/interfaces/IApiKeyCredentialScope.md)

Authorized connection identity; no account state is retained by this verifier.

##### apiKey

`string`

Backend-only candidate sent in x-goog-api-key, never in a URL or result.

##### signal

`AbortSignal`

Caller cancellation propagated to the bounded transport.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Safe API-key status; false means this check could not establish authentication.

#### Throws

An AiError for invalid input, cancellation, malformed responses, rate limits or provider failure.

#### Remarks

A denied request can reflect credential restrictions or project policy rather than
an invalid key. No failed check causes an inference request or an automatic retry.

#### Overrides

`ApiKeyVerifierBase.verify`
