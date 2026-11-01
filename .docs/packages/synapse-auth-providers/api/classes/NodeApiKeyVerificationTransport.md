# Class: NodeApiKeyVerificationTransport

Bounded Node.js HTTPS transport for provider authentication and account metadata only.

## Remarks

Every call uses GET, a fresh direct connection and normal TLS certificate verification.
Public DNS answers are validated at connection time and pinned to that connection; private,
reserved and mixed public/private answers are rejected. Credentials stay in headers. Redirects,
compressed responses, automatic retries and ambient proxy configuration are not used. A request
settles only after its owned request, response and socket have closed. Imports and construction
perform no DNS lookup, network request, timer registration or environment capture.

## Extends

- [`ApiKeyVerificationTransportBase`](ApiKeyVerificationTransportBase.md)

## Constructors

### Constructor

> **new NodeApiKeyVerificationTransport**(`options?`): `NodeApiKeyVerificationTransport`

Validates explicit limits without creating connections or reading credentials.

#### Parameters

##### options?

[`INodeApiKeyVerificationTransportOptions`](../interfaces/INodeApiKeyVerificationTransportOptions.md) = `{}`

Total timeout, response-byte budget and concurrent-request budget.

#### Returns

`NodeApiKeyVerificationTransport`

#### Throws

A safe AiError when a limit is not a positive safe integer or exceeds the timer ceiling.

#### Overrides

[`ApiKeyVerificationTransportBase`](ApiKeyVerificationTransportBase.md).[`constructor`](ApiKeyVerificationTransportBase.md#constructor)

## Methods

### get()

> **get**(`request`): `Promise`\<[`IApiKeyVerificationResponse`](../interfaces/IApiKeyVerificationResponse.md)\>

Reads one authentication endpoint with bounded DNS, connection and response lifetime.

#### Parameters

##### request

[`IApiKeyVerificationRequest`](../interfaces/IApiKeyVerificationRequest.md)

Public HTTPS endpoint, backend-only headers and caller cancellation.

#### Returns

`Promise`\<[`IApiKeyVerificationResponse`](../interfaces/IApiKeyVerificationResponse.md)\>

Bounded parsed JSON and HTTP status after the direct connection has closed.

#### Throws

A safe AiError for unsafe configuration, cancellation, expiry, concurrency/output limits or transport/protocol failure.

#### Remarks

HTTP errors retain their status for provider-specific classification. Non-JSON error
bodies are discarded. Response headers are limited to 16 KiB; bodies default to 1 MiB.
No key, destination URL, response body or raw error cause appears in a thrown error.

#### Overrides

[`ApiKeyVerificationTransportBase`](ApiKeyVerificationTransportBase.md).[`get`](ApiKeyVerificationTransportBase.md#get)
