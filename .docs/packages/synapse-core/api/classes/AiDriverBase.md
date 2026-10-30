# Abstract Class: AiDriverBase

Replaceable CLI/protocol implementation; construction and imports remain inert.

## Constructors

### Constructor

> **new AiDriverBase**(): `AiDriverBase`

#### Returns

`AiDriverBase`

## Properties

### auth?

> `readonly` `optional` **auth?**: [`AiAuthDriverBase`](AiAuthDriverBase.md)

Optional supported native authentication owner.

***

### capabilities

> `abstract` `readonly` **capabilities**: [`IAiCapabilities`](../interfaces/IAiCapabilities.md)

Execution guarantees that are enforced before launch.

***

### id

> `abstract` `readonly` **id**: `string`

Open implementation identifier; registration never requires a central provider enum.

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Releases implementation-owned resources after all its executions have been cancelled.

#### Returns

`Promise`\<`void`\>

Completion of the explicit teardown.

***

### execute()

> `abstract` **execute**(`context`): `Promise`\<[`IAiDriverResult`](../interfaces/IAiDriverResult.md)\>

Executes one native turn in the selected profile and prepared workspace.

#### Parameters

##### context

[`IAiExecutionContext`](../interfaces/IAiExecutionContext.md)

Explicit isolated execution context.

#### Returns

`Promise`\<[`IAiDriverResult`](../interfaces/IAiDriverResult.md)\>

Final native text, session and usage of the same invocation.

#### Throws

An AiError for typed provider/protocol/cancellation failures.

***

### inspect()

> **inspect**(`instance`, `signal`): `Promise`\<[`IAiInspection`](../interfaces/IAiInspection.md)\>

Explicitly inspects bounded metadata without initiating login or inference.

#### Parameters

##### instance

[`IAiInstance`](../interfaces/IAiInstance.md)

Selected isolated instance.

##### signal

`AbortSignal`

Bounded inspection cancellation.

#### Returns

`Promise`\<[`IAiInspection`](../interfaces/IAiInspection.md)\>

Safe provider/account/model metadata.
