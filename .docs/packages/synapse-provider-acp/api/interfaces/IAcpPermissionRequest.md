# Interface: IAcpPermissionRequest

Safe host decision context for one tool permission request in the active ACP session.

## Properties

### kind?

> `readonly` `optional` **kind?**: `string`

Protocol-reported tool kind, if provided.

***

### options

> `readonly` **options**: readonly [`IAcpPermissionOption`](IAcpPermissionOption.md)[]

Actual options offered by the native agent.

***

### sessionId

> `readonly` **sessionId**: `string`

Bound native session ID.

***

### title

> `readonly` **title**: `string`

Safe bounded tool label; raw inputs and command output are excluded.

***

### toolCallId

> `readonly` **toolCallId**: `string`

Opaque native tool invocation ID.
