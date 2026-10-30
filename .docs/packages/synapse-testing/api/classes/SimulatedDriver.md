# Class: SimulatedDriver

Explicit synthetic execution through the same runtime contracts as real providers.

## Remarks

This adapter performs no inference. A consumer must label simulation explicitly.

## Extends

- [`AiDriverBase`](../../../synapse-core/api/classes/AiDriverBase.md)

## Constructors

### Constructor

> **new SimulatedDriver**(`_options`): `SimulatedDriver`

Captures fixture behavior without performing work or retaining prompts.

#### Parameters

##### \_options

[`ISimulatedDriverOptions`](../interfaces/ISimulatedDriverOptions.md)

Explicit synthetic events, capabilities and result.

#### Returns

`SimulatedDriver`

#### Overrides

`AiDriverBase.constructor`

## Properties

### auth?

> `readonly` `optional` **auth?**: [`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md)

Optional supported native authentication owner.

#### Inherited from

`AiDriverBase.auth`

***

### capabilities

> `readonly` **capabilities**: [`IAiCapabilities`](../../../synapse-core/api/interfaces/IAiCapabilities.md)

Synthetic guarantees supplied to runtime capability validation.

#### Overrides

`AiDriverBase.capabilities`

***

### id

> `readonly` **id**: `string`

Open synthetic implementation identifier.

#### Overrides

`AiDriverBase.id`

## Accessors

### executionCount

#### Get Signature

> **get** **executionCount**(): `number`

Returns the number of actual execute calls, without storing their private inputs.

##### Returns

`number`

Completed or attempted synthetic invocation count.

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Releases implementation-owned resources after all its executions have been cancelled.

#### Returns

`Promise`\<`void`\>

Completion of the explicit teardown.

#### Inherited from

`AiDriverBase.dispose`

***

### execute()

> **execute**(`context`): `Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>

Emits fixture events and returns the explicitly supplied synthetic result.

#### Parameters

##### context

[`IAiExecutionContext`](../../../synapse-core/api/interfaces/IAiExecutionContext.md)

Real runtime context, cancellation and critical event sink.

#### Returns

`Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>

The configured synthetic result of this same invocation.

#### Throws

An AiError on cancellation; host callback failures propagate unchanged.

#### Overrides

`AiDriverBase.execute`

***

### inspect()

> **inspect**(`instance`, `signal`): `Promise`\<[`IAiInspection`](../../../synapse-core/api/interfaces/IAiInspection.md)\>

Explicitly inspects bounded metadata without initiating login or inference.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Selected isolated instance.

##### signal

`AbortSignal`

Bounded inspection cancellation.

#### Returns

`Promise`\<[`IAiInspection`](../../../synapse-core/api/interfaces/IAiInspection.md)\>

Safe provider/account/model metadata.

#### Inherited from

`AiDriverBase.inspect`
