# Abstract Class: RoutingStoreBase

Injected persistence boundary for host-owned routing telemetry and explicit account pauses.

## Remarks

Implementations must preserve unknown schema versions and throw on critical persistence failure.

## Extended by

- [`MemoryRoutingStore`](MemoryRoutingStore.md)

## Constructors

### Constructor

> **new RoutingStoreBase**(): `RoutingStoreBase`

#### Returns

`RoutingStoreBase`

## Methods

### clearAccount()

> `abstract` **clearAccount**(`scopeId`, `accountId`): `void`

Clears only the selected account's pause after expiry, recovery or explicit account switching.

#### Parameters

##### scopeId

`string`

Host namespace.

##### accountId

`string`

Account identity.

#### Returns

`void`

#### Throws

A host persistence error on failed removal.

***

### clearScope()

> `abstract` **clearScope**(`scopeId`): `void`

Removes the selected host scope's state through its authoritative lifecycle owner.

#### Parameters

##### scopeId

`string`

Host namespace to remove.

#### Returns

`void`

#### Throws

A host persistence error on failed removal.

***

### loadCooldown()

> `abstract` **loadCooldown**(`scopeId`, `accountId`): [`IAccountCooldown`](../interfaces/IAccountCooldown.md) \| `undefined`

Reads the shared pause of one account.

#### Parameters

##### scopeId

`string`

Host namespace.

##### accountId

`string`

Account identity.

#### Returns

[`IAccountCooldown`](../interfaces/IAccountCooldown.md) \| `undefined`

Persisted account pause, or undefined.

#### Throws

A host persistence error on failed reads.

***

### loadTelemetry()

> `abstract` **loadTelemetry**(`scopeId`, `kind`, `id`): [`IRouteTelemetry`](../interfaces/IRouteTelemetry.md) \| `undefined`

Reads an operational history without starting or retrying provider work.

#### Parameters

##### scopeId

`string`

Host namespace.

##### kind

`"candidate"` \| `"provider"`

Separate candidate/provider namespace.

##### id

`string`

Candidate or provider-group identity.

#### Returns

[`IRouteTelemetry`](../interfaces/IRouteTelemetry.md) \| `undefined`

Persisted history, or undefined when no record exists.

#### Throws

A host persistence error when the read cannot be completed.

***

### saveCooldown()

> `abstract` **saveCooldown**(`cooldown`): `void`

Saves one complete account pause.

#### Parameters

##### cooldown

[`IAccountCooldown`](../interfaces/IAccountCooldown.md)

Explicit native account-capacity evidence.

#### Returns

`void`

#### Throws

A host persistence error on failed writes.

***

### saveTelemetry()

> `abstract` **saveTelemetry**(`telemetry`): `void`

Saves one complete immutable history snapshot.

#### Parameters

##### telemetry

[`IRouteTelemetry`](../interfaces/IRouteTelemetry.md)

Versioned operational history.

#### Returns

`void`

#### Throws

A host persistence error; consumers must never retry a provider because this failed.
