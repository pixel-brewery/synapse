# Class: MemoryRoutingStore

Bounded runtime-local state; capacity failure never silently discards an active pause or circuit.

## Extends

- [`RoutingStoreBase`](RoutingStoreBase.md)

## Constructors

### Constructor

> **new MemoryRoutingStore**(`_maximumRecords?`): `MemoryRoutingStore`

Creates an inert bounded store.

#### Parameters

##### \_maximumRecords?

`number` = `10000`

Combined record limit; default 10000.

#### Returns

`MemoryRoutingStore`

#### Throws

An AiError for an invalid limit.

#### Overrides

[`RoutingStoreBase`](RoutingStoreBase.md).[`constructor`](RoutingStoreBase.md#constructor)

## Methods

### clearAccount()

> **clearAccount**(`scopeId`, `accountId`): `void`

Clears only one account pause.

#### Parameters

##### scopeId

`string`

Host namespace.

##### accountId

`string`

Account identity.

#### Returns

`void`

#### Overrides

[`RoutingStoreBase`](RoutingStoreBase.md).[`clearAccount`](RoutingStoreBase.md#clearaccount)

***

### clearScope()

> **clearScope**(`scopeId`): `void`

Releases all state owned by one host scope.

#### Parameters

##### scopeId

`string`

Host namespace to remove.

#### Returns

`void`

#### Overrides

[`RoutingStoreBase`](RoutingStoreBase.md).[`clearScope`](RoutingStoreBase.md#clearscope)

***

### loadCooldown()

> **loadCooldown**(`scopeId`, `accountId`): [`IAccountCooldown`](../interfaces/IAccountCooldown.md) \| `undefined`

Reads one account pause.

#### Parameters

##### scopeId

`string`

Host namespace.

##### accountId

`string`

Account identity.

#### Returns

[`IAccountCooldown`](../interfaces/IAccountCooldown.md) \| `undefined`

The immutable pause, if any.

#### Overrides

[`RoutingStoreBase`](RoutingStoreBase.md).[`loadCooldown`](RoutingStoreBase.md#loadcooldown)

***

### loadTelemetry()

> **loadTelemetry**(`scopeId`, `kind`, `id`): [`IRouteTelemetry`](../interfaces/IRouteTelemetry.md) \| `undefined`

Reads one candidate or provider history.

#### Parameters

##### scopeId

`string`

Host namespace.

##### kind

`"candidate"` \| `"provider"`

Candidate/provider namespace.

##### id

`string`

Stable history identity.

#### Returns

[`IRouteTelemetry`](../interfaces/IRouteTelemetry.md) \| `undefined`

Previously validated immutable snapshot, if any.

#### Overrides

[`RoutingStoreBase`](RoutingStoreBase.md).[`loadTelemetry`](RoutingStoreBase.md#loadtelemetry)

***

### saveCooldown()

> **saveCooldown**(`cooldown`): `void`

Saves explicit capacity evidence without evicting other active pauses.

#### Parameters

##### cooldown

[`IAccountCooldown`](../interfaces/IAccountCooldown.md)

Versioned account-capacity evidence.

#### Returns

`void`

#### Throws

An AiError if state is invalid or the store is full.

#### Overrides

[`RoutingStoreBase`](RoutingStoreBase.md).[`saveCooldown`](RoutingStoreBase.md#savecooldown)

***

### saveTelemetry()

> **saveTelemetry**(`telemetry`): `void`

Persists history within the configured memory budget.

#### Parameters

##### telemetry

[`IRouteTelemetry`](../interfaces/IRouteTelemetry.md)

Versioned history snapshot.

#### Returns

`void`

#### Throws

An AiError if state is invalid or the store is full.

#### Overrides

[`RoutingStoreBase`](RoutingStoreBase.md).[`saveTelemetry`](RoutingStoreBase.md#savetelemetry)
