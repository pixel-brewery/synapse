# Interface: IAiRouterOptions

Explicit host route composition and injected runtime-local routing policies.

## Properties

### admission?

> `readonly` `optional` **admission?**: [`RouteAdmission`](../classes/RouteAdmission.md)

Optional shared runtime-local admission controller.

***

### cooldowns?

> `readonly` `optional` **cooldowns?**: [`AccountCooldowns`](../classes/AccountCooldowns.md)

Optional shared account-capacity owner.

***

### governor?

> `readonly` `optional` **governor?**: [`RouteGovernor`](../classes/RouteGovernor.md)

Optional shared governor; when supplied it owns its own store and clock.

***

### models?

> `readonly` `optional` **models?**: [`ModelAvailabilityCache`](../classes/ModelAvailabilityCache.md)

Optional shared account/model evidence cache.

***

### now?

> `readonly` `optional` **now?**: () => `number`

UTC epoch-millisecond clock for attempt timing; defaults to Date.now.

#### Returns

`number`

Current UTC epoch milliseconds.

***

### routes

> `readonly` **routes**: readonly [`IRoute`](IRoute.md)[]

Validated route definitions; no ambient provider/account registration.

***

### store?

> `readonly` `optional` **store?**: [`RoutingStoreBase`](../classes/RoutingStoreBase.md)

Injected durable state adapter; default bounded in-memory storage.
