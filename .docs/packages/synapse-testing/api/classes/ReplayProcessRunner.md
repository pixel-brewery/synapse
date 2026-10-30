# Class: ReplayProcessRunner

Replays sanitized external process fragments through actual provider parsing and normalization.

## Remarks

No provider dependency, CLI, filesystem discovery or credential state is used.

## Extends

- [`ProcessRunnerBase`](../../../synapse-runtime/api/classes/ProcessRunnerBase.md)

## Constructors

### Constructor

> **new ReplayProcessRunner**(`steps`): `ReplayProcessRunner`

Captures a deterministic transport script without executing it.

#### Parameters

##### steps

readonly [`IProcessReplay`](../interfaces/IProcessReplay.md)[]

Externally supplied responses, one per actual native invocation.

#### Returns

`ReplayProcessRunner`

#### Overrides

`ProcessRunnerBase.constructor`

## Accessors

### executionCount

#### Get Signature

> **get** **executionCount**(): `number`

Returns the number of native invocations consumed from this transport script.

##### Returns

`number`

The replay invocation count, excluding calls rejected after disposal.

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Cancels and awaits all live replayed invocations without creating an operating-system process.

#### Returns

`Promise`\<`void`\>

Completion after every active transport replay settles.

#### Overrides

`ProcessRunnerBase.dispose`

***

### run()

> **run**(`request`): `Promise`\<[`IProcessResult`](../../../synapse-runtime/api/interfaces/IProcessResult.md)\>

Replays one native response through the caller's real serialized output callbacks.

#### Parameters

##### request

[`IProcessRequest`](../../../synapse-runtime/api/interfaces/IProcessRequest.md)

Actual provider subprocess request, including cancellation and byte limits.

#### Returns

`Promise`\<[`IProcessResult`](../../../synapse-runtime/api/interfaces/IProcessResult.md)\>

Bounded captured output and configured native completion status.

#### Throws

An AiError for script mismatch, cancellation, limits or disposal; callback failures remain unchanged.

#### Overrides

`ProcessRunnerBase.run`
