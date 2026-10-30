# Interface: IProcessResult

Bounded captured output and native completion status of one owned subprocess.

## Properties

### exitCode

> `readonly` **exitCode**: `number` \| `null`

Native exit status, or null when terminated by a signal.

***

### signal

> `readonly` **signal**: `string` \| `null`

Native termination signal name, if any.

***

### stderr

> `readonly` **stderr**: `string`

Decoded standard error; never expose this raw value in user-facing diagnostics.

***

### stdout

> `readonly` **stdout**: `string`

Decoded standard output, bounded by the requested combined output budget.
