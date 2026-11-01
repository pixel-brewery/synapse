# Interface: IAiAuthContext

Explicit authentication procedure with host-owned interaction presentation.

## Properties

### instance

> `readonly` **instance**: [`IAiInstance`](IAiInstance.md)

Isolated account instance being authenticated.

***

### interaction

> `readonly` **interaction**: (`interaction`) => `void`

Present an authentication interaction; auth owner validates identity and expiry.

#### Parameters

##### interaction

[`IAiAuthInteraction`](IAiAuthInteraction.md)

Correlated authentication interaction to present.

#### Returns

`void`

***

### methodId

> `readonly` **methodId**: `string`

Actually supported method selected by the host.

***

### response

> `readonly` **response**: (`interactionId`) => `Promise`\<`Readonly`\<`Record`\<`string`, `string`\>\>\>

Await an owner-validated response, cancelled when this flow ends.

#### Parameters

##### interactionId

`string`

Current interaction whose response is requested.

#### Returns

`Promise`\<`Readonly`\<`Record`\<`string`, `string`\>\>\>

Secret input values validated against the current owner and operation.

***

### signal

> `readonly` **signal**: `AbortSignal`

Authentication expiry/cancellation signal.
