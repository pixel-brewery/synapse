# Class: JsonLineDecoder

Serial fragmented JSON-lines decoder with a bounded pending frame.

## Constructors

### Constructor

> **new JsonLineDecoder**(`_onFrame`, `_maxBytes?`): `JsonLineDecoder`

Creates a decoder; transports must await each push to preserve callback ordering.

#### Parameters

##### \_onFrame

(`value`) => `Promise`\<`void`\>

Receives unknown parsed data for provider-owned runtime validation.

##### \_maxBytes?

`number` = `...`

Maximum pending frame bytes, default 4 MiB.

#### Returns

`JsonLineDecoder`

#### Throws

An AiError if the configured frame budget is invalid.

## Methods

### finish()

> **finish**(): `Promise`\<`void`\>

Processes the final optional non-newline-terminated frame.

#### Returns

`Promise`\<`void`\>

Completion after the final provider callback.

***

### push()

> **push**(`chunk`): `Promise`\<`void`\>

Accepts a UTF-8-decoded transport fragment and emits complete frames in order.

#### Parameters

##### chunk

`string`

Decoded text, possibly split inside a JSON frame.

#### Returns

`Promise`\<`void`\>

Completion after all complete frames and their callbacks finish.

#### Throws

An AiError for malformed or oversized frames; callback errors propagate unchanged.
