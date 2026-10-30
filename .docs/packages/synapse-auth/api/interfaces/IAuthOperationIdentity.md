# Interface: IAuthOperationIdentity

Correlation and ownership shared by every state of one native login.

## Properties

### driverId

> `readonly` **driverId**: `string`

Open implementation identifier owning the native procedure.

***

### expiresAt

> `readonly` **expiresAt**: `number`

Absolute UTC epoch milliseconds after which the operation is cancelled.

***

### instanceId

> `readonly` **instanceId**: `string`

Instance whose native credentials are changing.

***

### operationId

> `readonly` **operationId**: `string`

Unique authentication flow identifier, never reused by a manager.

***

### ownerId

> `readonly` **ownerId**: `string`

Host interaction owner authorized to provide secret responses.

***

### profileId

> `readonly` **profileId**: `string`

Isolated account profile whose execution admission is blocked.

***

### startedAt

> `readonly` **startedAt**: `number`

Absolute UTC epoch milliseconds when this operation started.
