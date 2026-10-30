# Abstract Class: AiRouteExecutorBase

Optional routing owner injected into the runtime, independent of concrete drivers.

## Constructors

### Constructor

> **new AiRouteExecutorBase**(): `AiRouteExecutorBase`

#### Returns

`AiRouteExecutorBase`

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Releases route-owned queues and bounded metadata state.

#### Returns

`Promise`\<`void`\>

Completion of routing cleanup; default implementations own no resources.

***

### execute()

> `abstract` **execute**(`request`, `execute`, `emit`): `Promise`\<[`IAiResult`](../interfaces/IAiResult.md)\>

Selects and executes eligible candidates under explicit host retry policy.

#### Parameters

##### request

[`IAiRequest`](../interfaces/IAiRequest.md)

Route request including cancellation and repeatability.

##### execute

(`request`) => `Promise`\<[`IAiResult`](../interfaces/IAiResult.md)\>

Executes one selected instance through the same runtime safeguards.

##### emit

(`event`) => `Promise`\<`void`\>

Publishes critical normalized routing progress.

#### Returns

`Promise`\<[`IAiResult`](../interfaces/IAiResult.md)\>

Exactly one successful outcome or a typed terminal failure.

#### Throws

An AiError when no eligible candidate can complete safely.
