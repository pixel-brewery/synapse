# Interface: IAiRuntimeOptions

Explicit composition and budgets for one local application runtime.

## Properties

### access?

> `readonly` `optional` **access?**: [`ProfileAccessCoordinator`](../classes/ProfileAccessCoordinator.md)

Shared gate also passed to the host's authentication manager.

***

### defaultTimeoutMs?

> `readonly` `optional` **defaultTimeoutMs?**: `number`

Default elapsed execution deadline in milliseconds, including queue time; default 30 minutes.

***

### drivers

> `readonly` **drivers**: readonly [`AiDriverBase`](../../../synapse-core/api/classes/AiDriverBase.md)[]

Concrete drivers selected by the consumer; never loaded from a global catalog.

***

### eventCapacity?

> `readonly` `optional` **eventCapacity?**: `number`

Retained normalized events per run; default 256, with explicit overflow summaries.

***

### instances

> `readonly` **instances**: readonly [`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)[]

Isolated configured account instances, with unique identifiers.

***

### maximumPromptBytes?

> `readonly` `optional` **maximumPromptBytes?**: `number`

Maximum input prompt bytes; default 4 MiB.

***

### maximumRuns?

> `readonly` `optional` **maximumRuns?**: `number`

Maximum active and queued runs in this runtime; default 128.

***

### router?

> `readonly` `optional` **router?**: [`AiRouteExecutorBase`](../../../synapse-core/api/classes/AiRouteExecutorBase.md)

Optional provider-neutral route executor.

***

### temporaryDirectory?

> `readonly` `optional` **temporaryDirectory?**: `string`

Optional absolute parent directory for owned non-Git text workspaces.
