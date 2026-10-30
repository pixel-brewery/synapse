# Interface: IOpenCodeGateway

Explicit host-configured OpenAI-compatible endpoint understood by the native OpenCode CLI.

## Properties

### baseUrl

> `readonly` **baseUrl**: `string`

Explicit HTTP(S) endpoint without embedded credentials.

***

### credentialEnvironmentName?

> `readonly` `optional` **credentialEnvironmentName?**: `string`

Optional environment variable name; the secret value stays in the instance environment.

***

### displayName

> `readonly` **displayName**: `string`

Safe provider display name; the host still owns its visible model catalog.

***

### providerId

> `readonly` **providerId**: `string`

Stable native provider ID used as the prefix of provider/model identifiers.
