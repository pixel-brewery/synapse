# Interface: IProfileRequest

Stable application/account identity and optional existing native CLI locations.

## Properties

### accountId

> `readonly` **accountId**: `string`

Host-defined account identifier, never a credential value.

***

### applicationId

> `readonly` **applicationId**: `string`

Application owner, never an authentication secret.

***

### driverId

> `readonly` **driverId**: `string`

Open driver identifier used to separate native configuration formats.

***

### id?

> `readonly` `optional` **id?**: `string`

Optional existing stable profile identity; otherwise derived from the owner tuple.

***

### paths?

> `readonly` `optional` **paths?**: `Partial`\<[`IAiProfilePaths`](../../../synapse-core/api/interfaces/IAiProfilePaths.md)\>

Explicit absolute legacy paths; absent locations use isolated profile defaults.
