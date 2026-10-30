# Interface: IModelAvailabilityOptions

Bounded cache lifetimes for authoritative account/model evidence.

## Properties

### availableMilliseconds?

> `readonly` `optional` **availableMilliseconds?**: `number`

Positive evidence TTL; default 5 minutes.

***

### maximumEntries?

> `readonly` `optional` **maximumEntries?**: `number`

Maximum cached entries and simultaneous inspections; default 1000.

***

### now?

> `readonly` `optional` **now?**: () => `number`

UTC epoch-millisecond clock; defaults to Date.now.

#### Returns

`number`

Current UTC epoch milliseconds.

***

### onInspectionError?

> `readonly` `optional` **onInspectionError?**: (`cause`) => `void`

Optional diagnostic sink; failures never replace the safe unknown result.

#### Parameters

##### cause

`unknown`

Internal inspection error; redact before logging or serialization.

#### Returns

`void`

***

### unavailableMilliseconds?

> `readonly` `optional` **unavailableMilliseconds?**: `number`

Negative evidence TTL; default 60 seconds.

***

### unknownMilliseconds?

> `readonly` `optional` **unknownMilliseconds?**: `number`

Unknown/failed inspection TTL; default 15 seconds.
