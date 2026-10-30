# Class: OpenCodeDriver

Executes installed OpenCode CLIs through their native noninteractive JSON protocol.

## Remarks

Imports and construction perform no discovery, login, installation or inference.

## Extends

- [`AiDriverBase`](../../../synapse-core/api/classes/AiDriverBase.md)

## Constructors

### Constructor

> **new OpenCodeDriver**(`_runner`): `OpenCodeDriver`

Creates an inert adapter with the shared owned-process boundary.

#### Parameters

##### \_runner

[`ProcessRunnerBase`](../../../synapse-runtime/api/classes/ProcessRunnerBase.md)

Injected operating-system runner or protocol replay transport.

#### Returns

`OpenCodeDriver`

#### Overrides

`AiDriverBase.constructor`

## Properties

### auth

> `readonly` **auth**: [`OpenCodeAuthDriver`](OpenCodeAuthDriver.md)

Explicit provider-specific native account lifecycle.

#### Overrides

`AiDriverBase.auth`

***

### capabilities

> `readonly` **capabilities**: [`IAiCapabilities`](../../../synapse-core/api/interfaces/IAiCapabilities.md)

Native policy modes and locally validated structured output support.

#### Overrides

`AiDriverBase.capabilities`

***

### id

> `readonly` **id**: `string` = `'opencode'`

Stable open driver identifier.

#### Overrides

`AiDriverBase.id`

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Stops and awaits processes owned by this explicitly injected runner.

#### Returns

`Promise`\<`void`\>

Completion after native execution, protocol and login processes have drained.

#### Overrides

`AiDriverBase.dispose`

***

### execute()

> **execute**(`context`): `Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>

Executes one selected native turn and normalizes only safe public events.

#### Parameters

##### context

[`IAiExecutionContext`](../../../synapse-core/api/interfaces/IAiExecutionContext.md)

Isolated instance, host policy, prompt and critical event sink.

#### Returns

`Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>

Final native text plus the latest session and token snapshot.

#### Throws

An AiError for native launch, protocol, authentication, capacity or session failures.

#### Overrides

`AiDriverBase.execute`

***

### inspect()

> **inspect**(`instance`, `signal`): `Promise`\<[`IAiInspection`](../../../synapse-core/api/interfaces/IAiInspection.md)\>

Inspects this isolated CLI's credentials and advertised model identifiers without inference.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Selected profile and explicit native settings.

##### signal

`AbortSignal`

Bounded inspection cancellation.

#### Returns

`Promise`\<[`IAiInspection`](../../../synapse-core/api/interfaces/IAiInspection.md)\>

Safe native account state and model metadata; host catalog policy remains separate.

#### Throws

An AiError when bounded native model discovery fails.

#### Overrides

`AiDriverBase.inspect`
