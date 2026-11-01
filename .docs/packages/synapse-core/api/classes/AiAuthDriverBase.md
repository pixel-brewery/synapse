# Abstract Class: AiAuthDriverBase

Replaceable authentication procedures, without an application token broker.

## Constructors

### Constructor

> **new AiAuthDriverBase**(): `AiAuthDriverBase`

#### Returns

`AiAuthDriverBase`

## Methods

### login()

> `abstract` **login**(`context`): `Promise`\<`void`\>

Performs the selected explicit authentication procedure under exclusive profile access.

#### Parameters

##### context

[`IAiAuthContext`](../interfaces/IAiAuthContext.md)

Expiring login and correlated interaction context.

#### Returns

`Promise`\<`void`\>

Procedure completion; the auth owner verifies status again before success.

#### Throws

An AiError when login fails or is cancelled.

***

### logout()

> `abstract` **logout**(`instance`, `signal`): `Promise`\<`void`\>

Removes this isolated account's configured credentials after its executions drain.

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

An AiError when logout fails.

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

Inspects account authentication through the driver's supported verification mechanism.

#### Parameters

##### instance

[`IAiInstance`](../interfaces/IAiInstance.md)

Selected isolated instance.

##### signal

`AbortSignal`

Bounded inspection cancellation.

#### Returns

`Promise`\<[`IAiAuthStatus`](../interfaces/IAiAuthStatus.md)\>

Safe account metadata with the authentication result.

#### Throws

An AiError when the host or provider inspection fails.

#### Remarks

Inspection does not initiate login or inference. Stored credentials alone do not establish remote validity; host-managed API keys require a host-owned verifier.
