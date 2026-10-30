# Interface: ICodexUsageWindow

One native account usage window normalized without consumer catalog policy.

## Properties

### remainingPercent

> `readonly` **remainingPercent**: `number`

Remaining percentage in the same native scale.

***

### resetsAt?

> `readonly` `optional` **resetsAt?**: `number`

Absolute UTC epoch-millisecond reset instant.

***

### usedPercent

> `readonly` **usedPercent**: `number`

Used percentage clamped to the inclusive range zero to one hundred.

***

### windowDurationMinutes?

> `readonly` `optional` **windowDurationMinutes?**: `number`

Duration of the native rolling window in minutes.
