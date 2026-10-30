# Interface: IAiRunHandle

One bounded event stream and one completion promise for a single operation.

## Properties

### cancel

> `readonly` **cancel**: () => `Promise`\<`void`\>

Abort and await this operation; repeated cancellation is safe. Rejects with a nonretryable host error when owned process termination cannot be confirmed.

#### Returns

`Promise`\<`void`\>

***

### events

> `readonly` **events**: `AsyncIterable`\<[`AiEvent`](../type-aliases/AiEvent.md)\>

Optional-consumption stream; a slow/absent consumer cannot block result completion.

***

### result

> `readonly` **result**: `Promise`\<[`IAiResult`](IAiResult.md)\>

Final result; rejects with a typed failure after owned execution cleanup.
