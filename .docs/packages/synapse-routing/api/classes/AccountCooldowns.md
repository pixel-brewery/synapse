# Class: AccountCooldowns

Shares only explicit account-scoped capacity evidence across sibling routes.

## Constructors

### Constructor

> **new AccountCooldowns**(`_store?`, `options?`): `AccountCooldowns`

Creates an inert account-capacity owner.

#### Parameters

##### \_store?

[`RoutingStoreBase`](RoutingStoreBase.md) = `...`

Shared host persistence or bounded memory.

##### options?

[`IAccountCooldownOptions`](../interfaces/IAccountCooldownOptions.md) = `{}`

Clock, default pauses and maximum reset hint.

#### Returns

`AccountCooldowns`

#### Throws

An AiError for invalid pause durations.

## Methods

### active()

> **active**(`scopeId`, `accountId`): [`IAccountCooldown`](../interfaces/IAccountCooldown.md) \| `undefined`

Reads a current account pause and removes only its expired record.

#### Parameters

##### scopeId

`string`

Host namespace.

##### accountId

`string`

Account identity shared across sibling routes.

#### Returns

[`IAccountCooldown`](../interfaces/IAccountCooldown.md) \| `undefined`

Active pause, or undefined after expiry/no record.

#### Throws

An AiError for invalid persisted state or storage failure.

***

### clearAccount()

> **clearAccount**(`scopeId`, `accountId`): `void`

Clears one account after explicit recovery or native credential switching.

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

An AiError when storage refuses removal.

***

### recordFailure()

> **recordFailure**(`scopeId`, `accountId`, `failure`): [`IAccountCooldown`](../interfaces/IAccountCooldown.md) \| `undefined`

Records a bounded pause only when the provider explicitly identifies account-wide capacity.

#### Parameters

##### scopeId

`string`

Host namespace.

##### accountId

`string`

Failed account identity.

##### failure

[`AiError`](../../../synapse-core/api/classes/AiError.md)

Typed provider evidence; unscoped/model-only failures are ignored.

#### Returns

[`IAccountCooldown`](../interfaces/IAccountCooldown.md) \| `undefined`

The saved pause, or undefined for non-account evidence.

#### Throws

An AiError when the account pause cannot be persisted.
