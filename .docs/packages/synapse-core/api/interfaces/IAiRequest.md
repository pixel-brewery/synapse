# Interface: IAiRequest

One text or agent operation; business prompts and policy remain host-owned.

## Properties

### deadline?

> `readonly` `optional` **deadline?**: `number`

Absolute UTC epoch milliseconds; includes queue and execution time.

***

### model?

> `readonly` `optional` **model?**: `string`

Optional provider-native model ID, selected by the host catalog.

***

### onEvent?

> `readonly` `optional` **onEvent?**: (`event`) => `Promise`\<`void`\>

Optional critical host progress/persistence callback; failure cancels without retry.

#### Parameters

##### event

[`AiEvent`](../type-aliases/AiEvent.md)

Normalized progress from this execution.

#### Returns

`Promise`\<`void`\>

***

### outputSchema?

> `readonly` `optional` **outputSchema?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Optional JSON Schema; the actual final output is locally validated.

***

### policy

> `readonly` **policy**: [`IAiPolicy`](IAiPolicy.md)

Native execution authorization and explicit repeatability.

***

### prompt

> `readonly` **prompt**: `string`

Host-composed prompt, supplied to native CLIs through stdin when supported.

***

### reasoningEffort?

> `readonly` `optional` **reasoningEffort?**: `string`

Optional native reasoning setting, validated by the driver.

***

### session?

> `readonly` `optional` **session?**: [`IAiSessionReference`](IAiSessionReference.md)

Optional continuation bound to the selected driver/profile/candidate.

***

### signal?

> `readonly` `optional` **signal?**: `AbortSignal`

Caller cancellation; abort never causes failover.

***

### target

> `readonly` **target**: [`AiTarget`](../type-aliases/AiTarget.md)

Explicit instance or route; no automatic global provider discovery.

***

### workingDirectory?

> `readonly` `optional` **workingDirectory?**: `string`

Existing host workspace; omitted text jobs receive a private non-Git workspace.
