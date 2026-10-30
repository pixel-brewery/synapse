# Interface: IRouteCandidate

One host-authorized execution candidate with open provider and account identities.

## Properties

### accountId

> `readonly` **accountId**: `string`

Account cooldown identity shared by sibling candidates in the same scope.

***

### costClass?

> `readonly` `optional` **costClass?**: [`RouteCostClass`](../type-aliases/RouteCostClass.md)

Host cost class; default unknown.

***

### id

> `readonly` **id**: `string`

Stable candidate identity, unique within its host scope, used for telemetry and native session binding.

***

### inspectModelAvailability?

> `readonly` `optional` **inspectModelAvailability?**: (`model`, `signal`) => `Promise`\<[`ModelAvailability`](../type-aliases/ModelAvailability.md)\>

Optional authoritative account-scoped inspector.

#### Parameters

##### model

`string`

Native model to inspect for this account.

##### signal

`AbortSignal`

Bounded operation cancellation.

#### Returns

`Promise`\<[`ModelAvailability`](../type-aliases/ModelAvailability.md)\>

Available, unavailable or unknown evidence; unknown does not block normal inference.

#### Remarks

The host owns this callback and its resources. It must observe cancellation and settle after bounded native cleanup; routing awaits that settlement rather than abandoning an unknown process. Inspection must not start login, inference, hooks or MCP sessions.

***

### instanceId

> `readonly` **instanceId**: `string`

Registered runtime instance selected for this candidate.

***

### model?

> `readonly` `optional` **model?**: `string`

Provider-native model selected by the host catalog.

***

### priority?

> `readonly` `optional` **priority?**: `number`

Lower values rank earlier; default 0 with stable input-order ties.

***

### providerId?

> `readonly` `optional` **providerId?**: `string`

Optional host-defined failure group for provider-wide circuit evidence.

***

### qualityScore?

> `readonly` `optional` **qualityScore?**: `number`

Host quality estimate from 0 to 100; default 50.

***

### reasoningEffort?

> `readonly` `optional` **reasoningEffort?**: `string`

Optional native reasoning setting.

***

### sessionAffinity?

> `readonly` `optional` **sessionAffinity?**: `boolean`

Whether a matching bound native session ranks first; default false.
