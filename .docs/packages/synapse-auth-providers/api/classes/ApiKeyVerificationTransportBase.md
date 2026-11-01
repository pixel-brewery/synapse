# Abstract Class: ApiKeyVerificationTransportBase

Replaceable backend boundary for bounded provider authentication GET requests.

## Remarks

Construction and imports must remain inert. Implementations own endpoint validation,
secret headers, response bounds and cancellation through awaited connection cleanup. They must
never invoke a model, follow redirects carrying credentials, retry or expose raw transport errors.

## Extended by

- [`NodeApiKeyVerificationTransport`](NodeApiKeyVerificationTransport.md)

## Constructors

### Constructor

> **new ApiKeyVerificationTransportBase**(): `ApiKeyVerificationTransportBase`

#### Returns

`ApiKeyVerificationTransportBase`

## Methods

### get()

> `abstract` **get**(`request`): `Promise`\<[`IApiKeyVerificationResponse`](../interfaces/IApiKeyVerificationResponse.md)\>

Performs one non-inference authentication request without automatic retries.

#### Parameters

##### request

[`IApiKeyVerificationRequest`](../interfaces/IApiKeyVerificationRequest.md)

Explicit HTTPS endpoint, private headers and caller cancellation.

#### Returns

`Promise`\<[`IApiKeyVerificationResponse`](../interfaces/IApiKeyVerificationResponse.md)\>

Bounded backend-only response after connection cleanup has completed.

#### Throws

A safe AiError for invalid configuration, cancellation, limits or transport failure.
