# Interface: IRouteGovernorOptions

Operational circuit policy and deterministic clock configuration.

## Properties

### circuitCooldownMilliseconds?

> `readonly` `optional` **circuitCooldownMilliseconds?**: `number`

Elapsed circuit pause duration; default 5 minutes.

***

### failureThreshold?

> `readonly` `optional` **failureThreshold?**: `number`

Consecutive failures opening a circuit; default 2.

***

### now?

> `readonly` `optional` **now?**: () => `number`

UTC epoch-millisecond clock; defaults to Date.now.

#### Returns

`number`

Current UTC epoch milliseconds.
