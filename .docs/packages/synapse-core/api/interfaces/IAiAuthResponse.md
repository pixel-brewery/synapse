# Interface: IAiAuthResponse

Owner-scoped response to a single active authentication interaction.

## Properties

### interactionId

> `readonly` **interactionId**: `string`

Current interaction identifier.

***

### operationId

> `readonly` **operationId**: `string`

Current authentication flow identifier.

***

### ownerId

> `readonly` **ownerId**: `string`

Host owner that started the authentication flow.

***

### values

> `readonly` **values**: `Readonly`\<`Record`\<`string`, `string`\>\>

Input values; never logged, persisted or exposed as progress.
