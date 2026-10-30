# Interface: IProcessReplay

One externally supplied native-process response, without importing a concrete AI provider.

## Properties

### args?

> `readonly` `optional` **args?**: readonly `string`[]

Optional exact expected argument vector; no prompts or credentials are recorded by the runner.

***

### executable?

> `readonly` `optional` **executable?**: `string`

Optional expected executable; mismatches reject rather than replaying the wrong procedure.

***

### exitCode?

> `readonly` `optional` **exitCode?**: `number` \| `null`

Native status, defaulting to zero.

***

### onInput?

> `readonly` `optional` **onInput?**: (`value`) => `void`

Optional explicit observer for native stdin, which may contain secrets.

#### Parameters

##### value

`string`

Original stdin data; the replay runner itself never stores or logs it.

#### Returns

`void`

***

### signal?

> `readonly` `optional` **signal?**: `string` \| `null`

Native signal name, defaulting to null.

***

### stderr?

> `readonly` `optional` **stderr?**: readonly `string`[]

Ordered standard-error fragments; consumers must redact them before presentation.

***

### stdout?

> `readonly` `optional` **stdout?**: readonly `string`[]

Ordered standard-output fragments, retaining the external protocol's actual framing.

***

### waitForStop?

> `readonly` `optional` **waitForStop?**: `boolean`

Whether the external process remains live after its fragments until cancellation or stop.
