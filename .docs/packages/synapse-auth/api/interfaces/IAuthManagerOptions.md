# Interface: IAuthManagerOptions

Bounded authentication lifecycle policy and deterministic test seams.

## Properties

### createId?

> `readonly` `optional` **createId?**: () => `string`

Correlation ID factory; defaults to randomUUID and must produce unique nonempty values.

#### Returns

`string`

One fresh opaque operation identifier.

***

### defaultTimeoutMs?

> `readonly` `optional` **defaultTimeoutMs?**: `number`

Default total login lifetime in milliseconds; defaults to 300000, maximum 1800000.

***

### eventCapacity?

> `readonly` `optional` **eventCapacity?**: `number`

Maximum retained event snapshots; defaults to 64. Older snapshots are dropped on overflow.

***

### maxPendingOperations?

> `readonly` `optional` **maxPendingOperations?**: `number`

Maximum live/tearing-down login operations; defaults to 64.

***

### now?

> `readonly` `optional` **now?**: () => `number`

UTC epoch-millisecond clock; defaults to Date.now and is read only on explicit operations.

#### Returns

`number`

Current absolute UTC epoch milliseconds.

***

### statusTimeoutMs?

> `readonly` `optional` **statusTimeoutMs?**: `number`

Background status deadline in milliseconds; defaults to 5000, maximum 30000.
