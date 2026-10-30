# Interface: IAiInstance

One configured driver instance with independent account and model state.

## Properties

### configuration?

> `readonly` `optional` **configuration?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Driver-specific validated options, kept behind the driver boundary.

***

### driverId

> `readonly` **driverId**: `string`

Open driver identifier registered explicitly by the consumer.

***

### environment?

> `readonly` `optional` **environment?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Explicit host environment additions, including optional credentials; never log them.

***

### executable?

> `readonly` `optional` **executable?**: `string`

Optional explicit native CLI executable; discovery occurs only on use.

***

### id

> `readonly` **id**: `string`

Host-defined instance identifier, unique within one runtime.

***

### profile

> `readonly` **profile**: [`IAiProfile`](IAiProfile.md)

Application/account profile owned by this instance.
