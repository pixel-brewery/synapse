# Class: RouteGovernor

Deterministic candidate ordering and persisted candidate/provider circuit evidence.

## Constructors

### Constructor

> **new RouteGovernor**(`_store?`, `options?`): `RouteGovernor`

Composes a governor without reading persisted state until used.

#### Parameters

##### \_store?

[`RoutingStoreBase`](RoutingStoreBase.md) = `...`

Host persistence or bounded runtime-local memory.

##### options?

[`IRouteGovernorOptions`](../interfaces/IRouteGovernorOptions.md) = `{}`

Clock and circuit policy.

#### Returns

`RouteGovernor`

#### Throws

An AiError for invalid circuit configuration.

## Methods

### clearScope()

> **clearScope**(`scopeId`): `void`

Removes only state belonging to a host scope being closed or explicitly reset.

#### Parameters

##### scopeId

`string`

Host namespace.

#### Returns

`void`

#### Throws

An AiError if the host storage refuses removal.

***

### history()

> **history**(`route`, `candidate`): [`IRouteTelemetry`](../interfaces/IRouteTelemetry.md)

Reads a safe candidate history for host projections and policy decisions.

#### Parameters

##### route

[`IRoute`](../interfaces/IRoute.md)

Host routing scope.

##### candidate

[`IRouteCandidate`](../interfaces/IRouteCandidate.md)

Candidate whose history is requested.

#### Returns

[`IRouteTelemetry`](../interfaces/IRouteTelemetry.md)

Validated candidate telemetry or an empty history.

#### Throws

An AiError for corrupt, unsupported or unavailable storage.

***

### isAvailable()

> **isAvailable**(`route`, `candidate`): `boolean`

Checks candidate and explicitly grouped provider circuits at the current clock instant.

#### Parameters

##### route

[`IRoute`](../interfaces/IRoute.md)

Host routing scope.

##### candidate

[`IRouteCandidate`](../interfaces/IRouteCandidate.md)

Candidate to check.

#### Returns

`boolean`

Whether both circuit windows have expired.

#### Throws

An AiError when persisted state cannot be read.

***

### order()

> **order**(`route`, `affinityCandidateId?`): readonly [`IRouteCandidate`](../interfaces/IRouteCandidate.md)[]

Orders eligible candidates with stable ties and optional same-candidate session affinity.

#### Parameters

##### route

[`IRoute`](../interfaces/IRoute.md)

Host-authorized candidates and strategy.

##### affinityCandidateId?

`string`

Candidate owning an existing native session.

#### Returns

readonly [`IRouteCandidate`](../interfaces/IRouteCandidate.md)[]

Ordered candidates whose local and shared provider circuits are closed.

#### Throws

An AiError when all circuits are open or persistence fails.

***

### recordAttempt()

> **recordAttempt**(`route`, `candidate`): `void`

Records admission before native execution; failures stop before provider launch.

#### Parameters

##### route

[`IRoute`](../interfaces/IRoute.md)

Host routing scope.

##### candidate

[`IRouteCandidate`](../interfaces/IRouteCandidate.md)

Selected candidate.

#### Returns

`void`

#### Throws

An AiError when history cannot be saved.

***

### recordFailure()

> **recordFailure**(`route`, `candidate`, `latencyMilliseconds`, `sharedProviderFailure?`): `void`

Records actual provider failure without counting cancellation or host errors.

#### Parameters

##### route

[`IRoute`](../interfaces/IRoute.md)

Host routing scope.

##### candidate

[`IRouteCandidate`](../interfaces/IRouteCandidate.md)

Failed candidate.

##### latencyMilliseconds

`number`

Elapsed native turn duration.

##### sharedProviderFailure?

`boolean` = `true`

Whether the failure is provider-wide; account/auth failures use false.

#### Returns

`void`

#### Throws

An AiError when failure state cannot be persisted.

***

### recordSuccess()

> **recordSuccess**(`route`, `candidate`, `latencyMilliseconds`): `void`

Records success separately from executing the provider, preventing persistence-triggered replay.

#### Parameters

##### route

[`IRoute`](../interfaces/IRoute.md)

Host routing scope.

##### candidate

[`IRouteCandidate`](../interfaces/IRouteCandidate.md)

Candidate that completed.

##### latencyMilliseconds

`number`

Elapsed native turn duration.

#### Returns

`void`

#### Throws

An AiError when success persistence fails; native execution must never be repeated.
