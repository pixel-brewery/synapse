# Interface: IAiSessionReference

Native continuation identity bound to its complete execution owner.

## Properties

### authenticationGeneration?

> `readonly` `optional` **authenticationGeneration?**: `string`

Original account/storage generation. Runtime-created references always include it; omission is reserved for imported legacy native IDs before the first authentication/configuration transition.

***

### candidateId

> `readonly` **candidateId**: `string`

Routing candidate identity; foreign candidates cannot reuse native state.

***

### driverId

> `readonly` **driverId**: `string`

Driver that created the native session.

***

### instanceId

> `readonly` **instanceId**: `string`

Configured instance that created the session.

***

### nativeId

> `readonly` **nativeId**: `string`

Opaque native session identifier, never forwarded across providers.

***

### profileId

> `readonly` **profileId**: `string`

Application/account profile that owns the session.
