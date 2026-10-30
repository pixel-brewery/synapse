# Class: NodeProcessRunner

Native executable/shim runner with bounded UTF-8 streams and awaited process-tree cleanup.

## Remarks

Uses cross-spawn's Windows PATH/PATHEXT and command-shim escaping rather than interpolating user shell commands.

## Extends

- [`ProcessRunnerBase`](ProcessRunnerBase.md)

## Constructors

### Constructor

> **new NodeProcessRunner**(`options?`): `NodeProcessRunner`

Creates an inert runner; executable resolution occurs only during run.

#### Parameters

##### options?

[`INodeProcessRunnerOptions`](../interfaces/INodeProcessRunnerOptions.md) = `{}`

Process-count and termination budgets.

#### Returns

`NodeProcessRunner`

#### Throws

An AiError when a resource budget is invalid.

#### Overrides

[`ProcessRunnerBase`](ProcessRunnerBase.md).[`constructor`](ProcessRunnerBase.md#constructor)

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Aborts all owned runs and awaits their process trees and result cleanup.

#### Returns

`Promise`\<`void`\>

Completion after every active run reaches its cleanup barrier.

#### Throws

An AiError with cleanupIncomplete and an unusable session if a native process tree cannot be terminated; a host must keep credential transitions blocked for the affected profile.

#### Remarks

Earlier incomplete cleanup remains latched after its run rejects and is reported by every later disposal. The latch does not reject new run calls before explicit disposal; profile admission is coordinated by the host runtime.

#### Overrides

[`ProcessRunnerBase`](ProcessRunnerBase.md).[`dispose`](ProcessRunnerBase.md#dispose)

***

### run()

> **run**(`request`): `Promise`\<[`IProcessResult`](../interfaces/IProcessResult.md)\>

Executes one explicit argument vector and resolves after native output and cleanup finish.

#### Parameters

##### request

[`IProcessRequest`](../interfaces/IProcessRequest.md)

Executable, complete profile environment, stdin and bounded callbacks.

#### Returns

`Promise`\<[`IProcessResult`](../interfaces/IProcessResult.md)\>

Captured output and native exit status; an intentional control.stop is a normal termination.

#### Throws

An AiError for launch, abort, timeout, resource-limit or critical callback failure; cleanupIncomplete remains set when native termination cannot be confirmed.

#### Remarks

POSIX cleanup waits for the owned process group to disappear, including descendants with separate output streams. Forced termination has a further one-second confirmation window after the configured graceful window. Native start and root-close acknowledgments use bounded one-second waits. Permission-denied group probes remain unconfirmed until absence is proven; fallback signals target only the owned child handle. Unconfirmed cleanup fails closed.

#### Overrides

[`ProcessRunnerBase`](ProcessRunnerBase.md).[`run`](ProcessRunnerBase.md#run)
