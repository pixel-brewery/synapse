# Abstract Class: ProcessRunnerBase

Replaceable operating-system execution boundary used by drivers and protocol replays.

## Extended by

- [`NodeProcessRunner`](NodeProcessRunner.md)

## Constructors

### Constructor

> **new ProcessRunnerBase**(): `ProcessRunnerBase`

#### Returns

`ProcessRunnerBase`

## Methods

### dispose()

> `abstract` **dispose**(): `Promise`\<`void`\>

Aborts and awaits all processes owned by this runner.

#### Returns

`Promise`\<`void`\>

Completion after all owned process trees have terminated.

***

### run()

> `abstract` **run**(`request`): `Promise`\<[`IProcessResult`](../interfaces/IProcessResult.md)\>

Starts one process and awaits completion plus owned cleanup.

#### Parameters

##### request

[`IProcessRequest`](../interfaces/IProcessRequest.md)

Argument vector, profile environment and resource limits.

#### Returns

`Promise`\<[`IProcessResult`](../interfaces/IProcessResult.md)\>

Bounded output and native completion status.

#### Throws

An AiError for launch, deadline, abort, output or host callback failure.
