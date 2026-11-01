# Class: MistralApiKeyVerifier

Verifies Mistral API credentials through its authenticated model-metadata endpoint.

## Remarks

Performs only GET /v1/models with a bearer credential. The model list is validated
and discarded; no account catalog, inference call or model capability is exposed. Successful
metadata access does not establish billing balance or entitlement to every inference model.

## Extends

- [`ApiKeyVerifierBase`](../../../../../synapse-auth/api/classes/ApiKeyVerifierBase.md)

## Constructors

### Constructor

> **new MistralApiKeyVerifier**(`_transport?`): `MistralApiKeyVerifier`

Captures the bounded HTTPS transport without reading credentials or contacting Mistral.

#### Parameters

##### \_transport?

[`ApiKeyVerificationTransportBase`](../../../classes/ApiKeyVerificationTransportBase.md) = `...`

Injected verification transport; defaults to the inert Node HTTPS adapter.

#### Returns

`MistralApiKeyVerifier`

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

Backend-only bearer key, never included in the request URL or result.

##### signal

`AbortSignal`

Caller cancellation propagated to the bounded transport.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Safe API-key status; false means this check could not establish authentication.

#### Throws

An AiError for invalid input, cancellation, malformed responses, rate limits or provider failure.

#### Remarks

A denied request may reflect access restrictions rather than an invalid key.
No failed check causes an inference request or an automatic retry.

#### Overrides

`ApiKeyVerifierBase.verify`
