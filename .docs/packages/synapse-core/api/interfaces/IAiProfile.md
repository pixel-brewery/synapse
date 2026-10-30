# Interface: IAiProfile

Stable identity and isolated storage of one application and account.

## Properties

### accountId

> `readonly` **accountId**: `string`

Host-defined account identity, never an authentication secret.

***

### applicationId

> `readonly` **applicationId**: `string`

Application owner; two applications must not share mutable profiles.

***

### id

> `readonly` **id**: `string`

Stable profile identifier; sessions bind to this value.

***

### paths

> `readonly` **paths**: [`IAiProfilePaths`](IAiProfilePaths.md)

Explicit profile paths, including supported legacy mappings.
