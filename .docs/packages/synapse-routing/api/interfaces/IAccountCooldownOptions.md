# Interface: IAccountCooldownOptions

Default bounded account-capacity pause policy.

## Properties

### maximumMilliseconds?

> `readonly` `optional` **maximumMilliseconds?**: `number`

Maximum accepted provider reset hint; default 31 days.

***

### now?

> `readonly` `optional` **now?**: () => `number`

UTC epoch-millisecond clock; defaults to Date.now.

#### Returns

`number`

Current UTC epoch milliseconds.

***

### quotaMilliseconds?

> `readonly` `optional` **quotaMilliseconds?**: `number`

Fallback for explicit exhausted account quota; default 15 minutes.

***

### rateLimitMilliseconds?

> `readonly` `optional` **rateLimitMilliseconds?**: `number`

Fallback for explicit account rate limits; default 60 seconds.
