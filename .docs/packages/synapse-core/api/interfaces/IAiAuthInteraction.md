# Interface: IAiAuthInteraction

One correlated, expiring native authentication interaction.

## Properties

### code?

> `readonly` `optional` **code?**: `string`

Device/user verification code, only for this interaction.

***

### expiresAt

> `readonly` **expiresAt**: `number`

Absolute UTC epoch milliseconds; responses after expiry fail.

***

### fields?

> `readonly` `optional` **fields?**: readonly [`IAiAuthField`](IAiAuthField.md)[]

Declared credentials inputs where supported.

***

### id

> `readonly` **id**: `string`

Unique interaction identifier; stale responses are rejected.

***

### message?

> `readonly` `optional` **message?**: `string`

Safe user instruction, never a raw environment/credential dump.

***

### type

> `readonly` **type**: `string`

Extensible interaction discriminator, e.g. browser/device-code/terminal/credentials.

***

### url?

> `readonly` `optional` **url?**: `string`

Native login URL for an explicit user interaction.
