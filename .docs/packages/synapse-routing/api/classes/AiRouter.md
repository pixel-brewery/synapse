# Class: AiRouter

Runtime-local routing with host eligibility, bounded admission and explicit replay permission.

## Remarks

Native execution and its process/profile safeguards remain in the injected runtime callback.

## Extends

- [`AiRouteExecutorBase`](../../../synapse-core/api/classes/AiRouteExecutorBase.md)

## Constructors

### Constructor

> **new AiRouter**(`options`): `AiRouter`

Validates immutable route registrations without discovering accounts or starting work.

#### Parameters

##### options

[`IAiRouterOptions`](../interfaces/IAiRouterOptions.md)

Host route definitions and optional shared state owners.

#### Returns

`AiRouter`

#### Throws

An AiError for invalid/duplicate routes, candidates or budgets.

#### Overrides

`AiRouteExecutorBase.constructor`

## Methods

### dispose()

> **dispose**(): `Promise`\<`void`\>

Aborts and awaits only this router's queued/active operations; durable host state is preserved.

#### Returns

`Promise`\<`void`\>

Completion after every owned operation has released its admission slot.

#### Overrides

`AiRouteExecutorBase.dispose`

***

### execute()

> **execute**(`request`, `execute`, `emit`): `Promise`\<[`IAiResult`](../../../synapse-core/api/interfaces/IAiResult.md)\>

Executes a registered route with at most one attempt per configured candidate.

#### Parameters

##### request

[`IAiRequest`](../../../synapse-core/api/interfaces/IAiRequest.md)

Route request with explicit repeatability and optional bound session.

##### execute

(`request`) => `Promise`\<[`IAiResult`](../../../synapse-core/api/interfaces/IAiResult.md)\>

One native attempt using the same runtime's isolation and cleanup.

##### emit

(`event`) => `Promise`\<`void`\>

Critical progress sink; callback failure is a nonretryable host error.

#### Returns

`Promise`\<[`IAiResult`](../../../synapse-core/api/interfaces/IAiResult.md)\>

One actual result after admission release, or a typed terminal failure.

#### Throws

An AiError on invalid selection, capacity, cancellation or terminal provider/host failure.

#### Overrides

`AiRouteExecutorBase.execute`
