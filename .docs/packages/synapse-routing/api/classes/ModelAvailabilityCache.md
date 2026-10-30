# Class: ModelAvailabilityCache

Bounded account/model evidence cache; failed or unavailable inspection remains unknown.

## Constructors

### Constructor

> **new ModelAvailabilityCache**(`options?`): `ModelAvailabilityCache`

Creates an inert bounded cache with independent positive, negative and unknown lifetimes.

#### Parameters

##### options?

[`IModelAvailabilityOptions`](../interfaces/IModelAvailabilityOptions.md) = `{}`

Clock and cache budgets.

#### Returns

`ModelAvailabilityCache`

#### Throws

An AiError for invalid durations or capacity.

## Methods

### clear()

> **clear**(): `void`

Clears only local metadata evidence.

#### Returns

`void`

***

### clearAccount()

> **clearAccount**(`scopeId`, `accountId`): `void`

Invalidates only one account's evidence and rejects late cache writes from older inspections.

#### Parameters

##### scopeId

`string`

Host namespace.

##### accountId

`string`

Account whose credentials or model state changed.

#### Returns

`void`

***

### clearScope()

> **clearScope**(`scopeId`): `void`

Invalidates one host scope without touching durable state or native credentials.

#### Parameters

##### scopeId

`string`

Host namespace.

#### Returns

`void`

***

### inspect()

> **inspect**(`scopeId`, `candidate`, `signal`): `Promise`\<[`ModelAvailability`](../type-aliases/ModelAvailability.md)\>

Inspects only an explicitly supplied account-scoped metadata source; model catalogs alone are not entitlement evidence.

#### Parameters

##### scopeId

`string`

Host namespace.

##### candidate

[`IRouteCandidate`](../interfaces/IRouteCandidate.md)

Account/model and optional authoritative inspector.

##### signal

`AbortSignal`

Inspection cancellation, propagated without caching a negative result.

#### Returns

`Promise`\<[`ModelAvailability`](../type-aliases/ModelAvailability.md)\>

Positive, negative or unknown evidence; unknown permits ordinary execution.

#### Throws

An AiError when inspection is cancelled or its owned resource cleanup remains unconfirmed; cleanup uncertainty takes precedence over cancellation.

#### Remarks

Supplied inspectors must honor the signal and settle after their bounded cleanup. The host owns their lifecycle; a noncooperating arbitrary callback cannot be forcibly stopped by the cache.
