# Class: AiRuntime

Explicit provider-neutral execution owner for CLI text jobs and resumable agent turns.

## Example

```ts
const handle = runtime.run({ target: { instanceId: 'personal' }, prompt: 'Summarize this text.', policy: { mode: 'read-only' } });
const result = await handle.result;
await runtime.dispose();
```

## Constructors

### Constructor

> **new AiRuntime**(`_options`): `AiRuntime`

Composes drivers and instances without filesystem, login, process or network effects.

#### Parameters

##### \_options

[`IAiRuntimeOptions`](../interfaces/IAiRuntimeOptions.md)

Explicit drivers, account profiles, shared gate and budgets.

#### Returns

`AiRuntime`

#### Throws

An AiError for duplicate IDs, missing drivers or invalid deterministic configuration.

## Accessors

### access

#### Get Signature

> **get** **access**(): [`ProfileAccessCoordinator`](ProfileAccessCoordinator.md)

Returns the gate that must also coordinate this runtime's native authentication.

##### Returns

[`ProfileAccessCoordinator`](ProfileAccessCoordinator.md)

Shared execution/credential transition owner.

## Methods

### configureInstance()

> **configureInstance**(`configuration`): `Promise`\<`void`\>

Adds or updates a host-configured instance while preserving shared runtime state.

#### Parameters

##### configuration

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Explicit driver/profile configuration; identical snapshots do not interrupt work.

#### Returns

`Promise`\<`void`\>

Completion after changed profiles drain and the new configuration becomes visible.

#### Throws

An AiError for invalid configuration, disposal or failed profile drain.

#### Remarks

Updates are serialized and acquire profile gates in stable order; no implicit discovery or login occurs.

***

### dispose()

> **dispose**(): `Promise`\<`void`\>

Stops owned operations, waits for cleanup and disposes explicitly registered drivers.

#### Returns

`Promise`\<`void`\>

Completion after run workspaces and process resources have been released.

#### Throws

An AiError if driver teardown fails.

***

### run()

> **run**(`request`): [`IAiRunHandle`](../../../synapse-core/api/interfaces/IAiRunHandle.md)

Starts one operation with optional observation and exactly one final result.

#### Parameters

##### request

[`IAiRequest`](../../../synapse-core/api/interfaces/IAiRequest.md)

Host prompt, target, authorization, schema and cancellation.

#### Returns

[`IAiRunHandle`](../../../synapse-core/api/interfaces/IAiRunHandle.md)

Handle whose result completes independently of event consumption.

#### Remarks

Failures reject result after cleanup. A critical host callback failure cancels the live attempt and never triggers provider failover.
Future deadlines must fit a positive 2147483647-millisecond native timer window; larger values reject before launch.
