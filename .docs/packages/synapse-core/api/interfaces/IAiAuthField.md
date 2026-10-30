# Interface: IAiAuthField

One declared input for a native credentials interaction.

## Properties

### id

> `readonly` **id**: `string`

Stable input identity used in the response values map.

***

### label

> `readonly` **label**: `string`

User-facing input label.

***

### required?

> `readonly` `optional` **required?**: `boolean`

Whether a response must include this input.

***

### secret

> `readonly` **secret**: `boolean`

Whether the value is a secret and must never be logged.
