# Interface: IAuthStartOptions

Explicit owner and procedure selected for one bounded native login.

## Properties

### methodId

> `readonly` **methodId**: `string`

Driver-local procedure identifier returned by its methods function.

***

### ownerId

> `readonly` **ownerId**: `string`

Host owner allowed to respond; it must be stable for the lifetime of this flow.

***

### signal?

> `readonly` `optional` **signal?**: `AbortSignal`

Optional host cancellation, propagated through native teardown.

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Total lifetime in milliseconds, including queue/drain time; defaults to the manager policy.
