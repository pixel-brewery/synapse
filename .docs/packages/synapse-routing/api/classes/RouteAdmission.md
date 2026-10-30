# Class: RouteAdmission

Bounded cancellable admission shared by every backup candidate of a host scope/route.

## Constructors

### Constructor

> **new RouteAdmission**(`_maximumRoutes?`): `RouteAdmission`

Creates an inert runtime-local admission controller.

#### Parameters

##### \_maximumRoutes?

`number` = `1000`

Maximum concurrently active route keys; default 1000.

#### Returns

`RouteAdmission`

#### Throws

An AiError for invalid route-state bounds.

## Methods

### run()

> **run**\<`T`\>(`route`, `signal`, `execute`): `Promise`\<`T`\>

Waits for a local route slot and releases it before resolving or rejecting the operation.

#### Type Parameters

##### T

`T`

The operation result.

#### Parameters

##### route

[`IRoute`](../interfaces/IRoute.md)

Scope, route and concurrency/queue budgets.

##### signal

`AbortSignal`

Cancellation; queued work never starts after abort.

##### execute

() => `Promise`\<`T`\>

Work that observes the same signal and awaits its own cleanup.

#### Returns

`Promise`\<`T`\>

The single operation result after slot release.

#### Remarks

Updated host budgets apply to new admissions; already active work is allowed to drain.

#### Throws

An AiError on cancellation, queue exhaustion or invalid configuration.

***

### snapshot()

> **snapshot**(`route`): [`IAdmissionSnapshot`](../interfaces/IAdmissionSnapshot.md)

Reads bounded local state without starting work.

#### Parameters

##### route

[`IRoute`](../interfaces/IRoute.md)

Host scope and route key.

#### Returns

[`IAdmissionSnapshot`](../interfaces/IAdmissionSnapshot.md)

Current active and queued counts and configured maximum.
