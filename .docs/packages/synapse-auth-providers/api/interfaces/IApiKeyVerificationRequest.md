# Interface: IApiKeyVerificationRequest

One bounded, non-inference provider authentication request.

## Remarks

Only GET is supported. API keys belong in headers, never the URL or request body.
The selected transport must protect headers from redirects and reject unsafe destinations.

## Properties

### headers

> `readonly` **headers**: `Readonly`\<`Record`\<`string`, `string`\>\>

Explicit authentication and protocol headers; values are backend-only secrets.

***

### signal

> `readonly` **signal**: `AbortSignal`

Caller cancellation, including the outer authentication operation's expiry.

***

### url

> `readonly` **url**: `string`

Public HTTPS authentication or account-metadata endpoint selected by the verifier.
