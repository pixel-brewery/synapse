# Interface: IAiUsage

Latest cumulative token usage reported for one execution.

## Properties

### cachedInput

> `readonly` **cachedInput**: `number`

Input tokens served from cache.

***

### input

> `readonly` **input**: `number`

Input tokens, including cached input if the provider includes it.

***

### output

> `readonly` **output**: `number`

Generated output tokens.

***

### total

> `readonly` **total**: `number`

Total input plus output tokens; consumers replace prior snapshots.
