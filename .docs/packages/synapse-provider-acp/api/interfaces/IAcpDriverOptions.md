# Interface: IAcpDriverOptions

Explicit native ACP configuration; the host attests the meaning of each advertised policy mode.

## Properties

### args?

> `readonly` `optional` **args?**: readonly `string`[]

Native CLI arguments used for its stdio ACP mode; never an installer command.

***

### auth?

> `readonly` `optional` **auth?**: [`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md)

Optional verified native CLI auth adapter; ACP alone exposes no safe account-status check.

***

### id?

> `readonly` `optional` **id?**: `string`

Open driver identity; use distinct IDs for agents with different native policy guarantees.

***

### maxMessageBytes?

> `readonly` `optional` **maxMessageBytes?**: `number`

Maximum incoming protocol frame bytes; default 1 MiB, with a separate process-output limit.

***

### maxOutputBytes?

> `readonly` `optional` **maxOutputBytes?**: `number`

Maximum combined process output bytes for one connection; default 4 MiB.

***

### modeIds

> `readonly` **modeIds**: `Readonly`\<`Partial`\<`Record`\<`"read-only"` \| `"workspace-write"`, `string`\>\>\>

Trusted mapping to native read-only/workspace-write modes. Missing modes are unsupported.

***

### modelConfigId?

> `readonly` `optional` **modelConfigId?**: `string`

Optional advertised session-config ID controlling the native model.

***

### permission?

> `readonly` `optional` **permission?**: (`request`) => `Promise`\<`string` \| `undefined`\>

Optional host permission decision. Without it, every tool permission request is denied.

#### Parameters

##### request

[`IAcpPermissionRequest`](IAcpPermissionRequest.md)

Safe current-session decision context.

#### Returns

`Promise`\<`string` \| `undefined`\>

An offered option ID, or undefined to deny/cancel the request.

***

### reasoningConfigId?

> `readonly` `optional` **reasoningConfigId?**: `string`

Optional advertised session-config ID controlling native reasoning effort.

***

### resume?

> `readonly` `optional` **resume?**: `boolean`

Whether resume may be negotiated; session/load is still checked during initialize. Default true.
