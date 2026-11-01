# Interface: IApiKeyVerificationResponse

Bounded provider authentication response, retained inside the backend verifier.

## Remarks

The body is untrusted provider data. Concrete verifiers validate only the fields they
need and return safe authentication metadata instead of publishing this transport response.

## Properties

### body

> `readonly` **body**: `unknown`

Parsed JSON, or undefined for an empty or non-JSON unsuccessful response body.

***

### status

> `readonly` **status**: `number`

HTTP status returned by the selected endpoint, without following redirects.
