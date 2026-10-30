# Interface: IAiExecutionContext

Explicit per-turn context passed into a replaceable driver.

## Properties

### emit

> `readonly` **emit**: (`event`) => `Promise`\<`void`\>

Publish normalized events; callback errors must propagate and stop execution.

#### Parameters

##### event

[`AiEvent`](../type-aliases/AiEvent.md)

Safe normalized event to publish.

#### Returns

`Promise`\<`void`\>

***

### instance

> `readonly` **instance**: [`IAiInstance`](IAiInstance.md)

Selected isolated instance.

***

### request

> `readonly` **request**: [`IAiRequest`](IAiRequest.md)

Host request with selected target and preserved policy.

***

### session

> `readonly` **session**: (`nativeId`) => [`IAiSessionReference`](IAiSessionReference.md)

Bind a native session ID to this driver/profile/candidate.

#### Parameters

##### nativeId

`string`

Provider-native continuation identity.

#### Returns

[`IAiSessionReference`](IAiSessionReference.md)

A reference bound to the actual driver, profile, instance and candidate.

***

### signal

> `readonly` **signal**: `AbortSignal`

Combined runtime deadline/cancellation signal.

***

### workingDirectory

> `readonly` **workingDirectory**: `string`

Prepared workspace; may be a non-Git text workspace.
