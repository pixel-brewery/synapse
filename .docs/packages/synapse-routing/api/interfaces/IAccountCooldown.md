# Interface: IAccountCooldown

Versioned explicit account-capacity pause shared across sibling routes.

## Properties

### accountId

> `readonly` **accountId**: `string`

Explicit account identity shared by sibling candidates.

***

### observedAt

> `readonly` **observedAt**: `number`

UTC epoch milliseconds when account capacity failed.

***

### reason

> `readonly` **reason**: `"quota"` \| `"rate-limit"`

Native account-capacity classification.

***

### retryAt

> `readonly` **retryAt**: `number`

UTC epoch milliseconds when a new native attempt may be admitted.

***

### schemaVersion

> `readonly` **schemaVersion**: `1`

Persisted cooldown schema version.

***

### scopeId

> `readonly` **scopeId**: `string`

Host namespace, isolating applications and workspaces.
