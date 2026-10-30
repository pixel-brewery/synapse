# Interface: IAiAuthMethod

An authentication procedure actually supported by a driver.

## Properties

### id

> `readonly` **id**: `string`

Driver-local method identifier.

***

### kind

> `readonly` **kind**: `"browser"` \| `"device-code"` \| `"terminal"` \| `"credentials"`

Required native interaction family.

***

### label

> `readonly` **label**: `string`

Human-readable procedure name.
