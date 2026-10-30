# Interface: IAiCapabilities

Execution guarantees that a driver actually implements.

## Properties

### modes

> `readonly` **modes**: readonly (`"read-only"` \| `"workspace-write"`)[]

Native execution policies that can be enforced before launch.

***

### resume

> `readonly` **resume**: `boolean`

Whether native sessions can be resumed for the same profile/candidate.

***

### structuredOutput

> `readonly` **structuredOutput**: `"native"` \| `"validated"` \| `"none"`

Native schema support or local result validation availability.

***

### tools

> `readonly` **tools**: `boolean`

Whether the driver supports agent tool operations.
