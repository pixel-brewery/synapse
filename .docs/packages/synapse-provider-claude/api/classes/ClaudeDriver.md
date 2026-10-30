# Class: ClaudeDriver

Native Claude print/stream-json adapter with explicit account and permission isolation.

## Remarks

Safe mode preserves native subscription authentication; no API key is required.

## Extends

- [`AiDriverBase`](../../../synapse-core/api/classes/AiDriverBase.md)

## Constructors

### Constructor

> **new ClaudeDriver**(`_runner`): `ClaudeDriver`

Creates an explicitly composed inert driver.

#### Parameters

##### \_runner

[`ProcessRunnerBase`](../../../synapse-runtime/api/classes/ProcessRunnerBase.md)

Dedicated owned subprocess boundary; dispose drains its processes.

#### Returns

`ClaudeDriver`

#### Overrides

`AiDriverBase.constructor`

## Properties

### auth

> `readonly` **auth**: [`ClaudeAuthDriver`](ClaudeAuthDriver.md)

Native procedures sharing this driver's owned subprocess boundary.

#### Overrides

`AiDriverBase.auth`

***

### capabilities

> `readonly` **capabilities**: [`IAiCapabilities`](../../../synapse-core/api/interfaces/IAiCapabilities.md)

Native plan/acceptEdits permissions, continuation and schema output support.

#### Overrides

`AiDriverBase.capabilities`

***

### id

> `readonly` **id**: `string` = `'claude'`

Open identity used for explicit consumer registration.

#### Overrides

`AiDriverBase.id`

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Stops and awaits every native execution/login owned by this driver.

#### Returns

`Promise`\<`void`\>

Completion after the injected owned runner drains.

#### Overrides

`AiDriverBase.dispose`

***

### execute()

> **execute**(`context`): `Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>

Executes one native print turn without putting the prompt in process arguments.

#### Parameters

##### context

[`IAiExecutionContext`](../../../synapse-core/api/interfaces/IAiExecutionContext.md)

Isolated authorized execution and critical event callback.

#### Returns

`Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>

The same invocation's final text, native structured output and usage.

#### Throws

An AiError for configuration, native/protocol or cancellation failure.

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
