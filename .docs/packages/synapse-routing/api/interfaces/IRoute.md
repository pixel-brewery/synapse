# Interface: IRoute

Host-owned route configuration; all candidates must already be authorized by the host.

## Properties

### candidates

> `readonly` **candidates**: readonly [`IRouteCandidate`](IRouteCandidate.md)[]

Eligible candidates in stable configured order; no automatic catalog discovery.

***

### id

> `readonly` **id**: `string`

Unique route policy identifier within this router.

***

### maxParallelExecutions?

> `readonly` `optional` **maxParallelExecutions?**: `number`

Per scope/route concurrency, shared by all backup candidates; default 1.

***

### maxQueuedExecutions?

> `readonly` `optional` **maxQueuedExecutions?**: `number`

Maximum waiting operations for this route; default 256.

***

### scopeId

> `readonly` **scopeId**: `string`

Host application/workspace namespace for queues and durable routing state.

***

### strategy?

> `readonly` `optional` **strategy?**: [`RouteStrategy`](../type-aliases/RouteStrategy.md)

Selection strategy; default priority.
