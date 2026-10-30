# Abstract Class: AiAuthDriverBase

Replaceable native authentication procedures, without an application token broker.

## Constructors

### Constructor

> **new AiAuthDriverBase**(): `AiAuthDriverBase`

#### Returns

`AiAuthDriverBase`

## Methods

### login()

> `abstract` **login**(`context`): `Promise`\<`void`\>

Performs the selected explicit native login while the auth owner holds exclusive profile access.

#### Parameters

##### context

[`IAiAuthContext`](../interfaces/IAiAuthContext.md)

Expiring login and correlated interaction context.

#### Returns

`Promise`\<`void`\>

Native CLI completion; the auth owner verifies status again before success.

#### Throws

An AiError when login fails or is cancelled.

***

### logout()

> `abstract` **logout**(`instance`, `signal`): `Promise`\<`void`\>

Removes this isolated account's native credentials after its executions drain.

#### Parameters

##### instance

[`IAiInstance`](../interfaces/IAiInstance.md)

Selected isolated account.

##### signal

`AbortSignal`

Logout cancellation.

#### Returns

`Promise`\<`void`\>

Completion after owned credential changes finish.

#### Throws

An AiError when the native logout fails.

***

### methods()

> `abstract` **methods**(`instance`): readonly [`IAiAuthMethod`](../interfaces/IAiAuthMethod.md)[]

Lists supported procedures without login or ambient credential discovery.

#### Parameters

##### instance

[`IAiInstance`](../interfaces/IAiInstance.md)

Selected isolated instance.

#### Returns

readonly [`IAiAuthMethod`](../interfaces/IAiAuthMethod.md)[]

Only procedures this implementation actually supports.

***

### status()

> `abstract` **status**(`instance`, `signal`): `Promise`\<[`IAiAuthStatus`](../interfaces/IAiAuthStatus.md)\>

Verifies native CLI account state without launching a login or hooks.

#### Parameters

##### instance

[`IAiInstance`](../interfaces/IAiInstance.md)

Selected isolated instance.

##### signal

`AbortSignal`

Bounded inspection cancellation.

#### Returns

`Promise`\<[`IAiAuthStatus`](../interfaces/IAiAuthStatus.md)\>

Safe verified account metadata.

#### Throws

An AiError when the host/CLI inspection fails.
