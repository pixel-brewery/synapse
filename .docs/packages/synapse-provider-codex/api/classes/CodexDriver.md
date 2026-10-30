# Class: CodexDriver

Native Codex exec/JSONL adapter with isolated credentials and legacy-compatible sessions.

## Remarks

Constructing this driver performs no discovery, authentication or process work.

## Extends

- [`AiDriverBase`](../../../synapse-core/api/classes/AiDriverBase.md)

## Constructors

### Constructor

> **new CodexDriver**(`_runner`): `CodexDriver`

Creates an explicitly composed native driver without startup effects.

#### Parameters

##### \_runner

[`ProcessRunnerBase`](../../../synapse-runtime/api/classes/ProcessRunnerBase.md)

Dedicated owned subprocess runner; dispose releases its processes.

#### Returns

`CodexDriver`

#### Overrides

`AiDriverBase.constructor`

## Properties

### auth

> `readonly` **auth**: [`CodexAuthDriver`](CodexAuthDriver.md)

Native account procedures sharing the driver's subprocess owner.

#### Overrides

`AiDriverBase.auth`

***

### capabilities

> `readonly` **capabilities**: [`IAiCapabilities`](../../../synapse-core/api/interfaces/IAiCapabilities.md)

Native sandbox, resume and schema capabilities enforced by this adapter.

#### Overrides

`AiDriverBase.capabilities`

***

### id

> `readonly` **id**: `string` = `'codex'`

Open driver identity used for explicit runtime registration.

#### Overrides

`AiDriverBase.id`

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Stops owned native processes and awaits queued same-profile operations.

#### Returns

`Promise`\<`void`\>

Completion once this driver's process and profile queues are drained.

#### Overrides

`AiDriverBase.dispose`

***

### execute()

> **execute**(`context`): `Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>

Executes one turn through native Codex exec; prompts never enter argv.

#### Parameters

##### context

[`IAiExecutionContext`](../../../synapse-core/api/interfaces/IAiExecutionContext.md)

Isolated authorized request and critical event callback.

#### Returns

`Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>

Final text, session and usage from this same native turn.

#### Throws

An AiError for unsupported policy, native/protocol failure or credential persistence failure.

#### Remarks

Same-profile turns serialize credential snapshots and native token refresh commits. Different profiles remain independent. Unconfirmed native process cleanup blocks credential refresh commits.

#### Overrides

`AiDriverBase.execute`

***

### inspect()

> **inspect**(`instance`, `signal`): `Promise`\<[`ICodexInspection`](../interfaces/ICodexInspection.md)\>

Inspects metadata through a separate credential-only native home, without agent startup.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Selected isolated account and explicit native paths.

##### signal

`AbortSignal`

Bounded inspection cancellation.

#### Returns

`Promise`\<[`ICodexInspection`](../interfaces/ICodexInspection.md)\>

Native models, account limits and safe optional usage details.

#### Throws

An AiError for model/protocol or host persistence failure.

#### Remarks

Unconfirmed native process cleanup blocks credential refresh commits.

#### Overrides

`AiDriverBase.inspect`
