# Interface: IAiPolicy

Host authorization and retry intent for an execution.

## Properties

### allowedTools?

> `readonly` `optional` **allowedTools?**: readonly `string`[]

Optional tool allowlist; drivers must reject unsupported enforcement.

***

### allowWriteRetry?

> `readonly` `optional` **allowWriteRetry?**: `boolean`

Additional explicit permission to replay a writing operation; default false.

***

### deniedTools?

> `readonly` `optional` **deniedTools?**: readonly `string`[]

Optional tool denylist; drivers must reject unsupported enforcement.

***

### mode

> `readonly` **mode**: `"read-only"` \| `"workspace-write"`

Required native filesystem policy; unsupported modes fail before launch.

***

### repeatable?

> `readonly` `optional` **repeatable?**: `boolean`

Explicit permission to replay a failed transient text/read operation; default false.
