# Interface: IOpenCodeConfiguration

Optional native OpenCode settings supplied in an instance's configuration record.

## Properties

### authMethod?

> `readonly` `optional` **authMethod?**: `string`

Exact native login method label; prevents ambiguous interactive method selection.

***

### deniedCommands?

> `readonly` `optional` **deniedCommands?**: readonly `string`[]

Native bash permission patterns the host explicitly forbids, such as git push*.

***

### gateway?

> `readonly` `optional` **gateway?**: [`IOpenCodeGateway`](IOpenCodeGateway.md)

Optional explicitly configured compatible provider; no gateway is installed by Synapse.

***

### model?

> `readonly` `optional` **model?**: `string`

Optional fallback native provider/model ID; a request model takes precedence.

***

### providerId?

> `readonly` `optional` **providerId?**: `string`

Provider account to inspect/authenticate; required for native login and logout.

***

### variant?

> `readonly` `optional` **variant?**: `string`

Optional fallback reasoning variant; a request setting takes precedence.
