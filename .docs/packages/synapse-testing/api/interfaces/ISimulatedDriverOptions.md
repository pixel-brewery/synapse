# Interface: ISimulatedDriverOptions

Explicit synthetic driver behavior for deterministic tests and clearly labeled demonstrations.

## Properties

### capabilities?

> `readonly` `optional` **capabilities?**: [`IAiCapabilities`](../../../synapse-core/api/interfaces/IAiCapabilities.md)

Optional native guarantees to exercise runtime capability checks.

***

### events?

> `readonly` `optional` **events?**: readonly [`AiEvent`](../../../synapse-core/api/type-aliases/AiEvent.md)[]

Synthetic normalized events emitted through the actual runtime event sink.

***

### id?

> `readonly` `optional` **id?**: `string`

Open driver ID, defaulting to simulated.

***

### result

> `readonly` **result**: [`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md) \| ((`context`) => [`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md) \| `Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>)

Explicit fixture result, or caller-supplied synthetic behavior; never a hidden AI fallback.

#### Param

**context**

Selected execution context used by a custom simulation.

#### Returns

The synthetic final native result, possibly asynchronously.
