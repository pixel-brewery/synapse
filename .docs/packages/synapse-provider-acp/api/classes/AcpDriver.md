# Class: AcpDriver

Generic installed-agent ACP stdio adapter using the official TypeScript SDK.

## Remarks

ACP does not define a universal filesystem sandbox. The host must supply trusted native policy-mode mappings; unsupported guarantees fail before prompting. Client filesystem and terminal capabilities are never advertised.

## Extends

- [`AiDriverBase`](../../../synapse-core/api/classes/AiDriverBase.md)

## Constructors

### Constructor

> **new AcpDriver**(`_runner`, `_options`): `AcpDriver`

Creates an inert protocol adapter with explicit native policy semantics.

#### Parameters

##### \_runner

[`ProcessRunnerBase`](../../../synapse-runtime/api/classes/ProcessRunnerBase.md)

Owned process boundary, shared with the runtime.

##### \_options

[`IAcpDriverOptions`](../interfaces/IAcpDriverOptions.md)

Native arguments, trusted mode mappings and optional host permissions.

#### Returns

`AcpDriver`

#### Throws

An AiError when deterministic native mode or resource settings are invalid.

#### Overrides

`AiDriverBase.constructor`

## Properties

### auth

> `readonly` **auth**: [`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md) \| `undefined`

Optional separately verified native authentication implementation.

#### Overrides

`AiDriverBase.auth`

***

### capabilities

> `readonly` **capabilities**: [`IAiCapabilities`](../../../synapse-core/api/interfaces/IAiCapabilities.md)

Host-declared native policy modes, with resume verified again through negotiation.

#### Overrides

`AiDriverBase.capabilities`

***

### id

> `readonly` **id**: `string`

Open implementation ID, defaulting to acp.

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

Negotiates the agent, binds a session, enforces configured native policy and executes one turn.

#### Parameters

##### context

[`IAiExecutionContext`](../../../synapse-core/api/interfaces/IAiExecutionContext.md)

Isolated profile, explicit request, cancellation and critical event callback.

#### Returns

`Promise`\<[`IAiDriverResult`](../../../synapse-core/api/interfaces/IAiDriverResult.md)\>

The same turn's final text and bound native continuation ID.

#### Throws

An AiError for unsupported security/model capabilities, protocol failure, cancellation or unconfirmed native process cleanup. Cleanup uncertainty takes precedence over another failure and disables retries.

#### Overrides

`AiDriverBase.execute`

***

### inspect()

> **inspect**(`instance`, `signal`): `Promise`\<[`IAiInspection`](../../../synapse-core/api/interfaces/IAiInspection.md)\>

Performs only bounded initialization and optional independent native account verification.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Isolated native agent instance.

##### signal

`AbortSignal`

Inspection cancellation.

#### Returns

`Promise`\<[`IAiInspection`](../../../synapse-core/api/interfaces/IAiInspection.md)\>

Safe account metadata, without sending session, filesystem, terminal or MCP setup requests.

#### Throws

An AiError if the native handshake fails or negotiates an incompatible protocol.

#### Overrides

`AiDriverBase.inspect`
