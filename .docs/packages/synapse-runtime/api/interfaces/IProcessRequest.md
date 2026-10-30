# Interface: IProcessRequest

Explicit subprocess intent; runtime owns launch, bounds, stream decoding and teardown.

## Properties

### args

> `readonly` **args**: readonly `string`[]

Native argument vector, never an interpolated shell command.

***

### environment

> `readonly` **environment**: `Readonly`\<`Record`\<`string`, `string`\>\>

Complete allowlisted environment, supplied explicitly by the profile owner.

***

### executable

> `readonly` **executable**: `string`

Resolved executable or CLI name to find through this request's environment.

***

### input?

> `readonly` `optional` **input?**: `string`

Initial stdin payload; may contain sensitive prompt or credentials.

***

### keepInputOpen?

> `readonly` `optional` **keepInputOpen?**: `boolean`

Whether stdin stays open for an interactive authentication procedure; default false.

***

### maxOutputBytes?

> `readonly` `optional` **maxOutputBytes?**: `number`

Combined stdout/stderr byte budget; default 4 MiB.

***

### onStart?

> `readonly` `optional` **onStart?**: (`process`) => `void`

Supplies interactive stdin controls immediately after spawn.

#### Parameters

##### process

[`IInteractiveProcess`](IInteractiveProcess.md)

Controls restricted to the owned subprocess.

#### Returns

`void`

***

### onStderr?

> `readonly` `optional` **onStderr?**: (`chunk`) => `void` \| `Promise`\<`void`\>

Optional serialized stderr callback, with the same failure semantics.

#### Parameters

##### chunk

`string`

Native stderr text; treat as untrusted and sensitive.

#### Returns

`void` \| `Promise`\<`void`\>

Optional asynchronous processing completion.

***

### onStdout?

> `readonly` `optional` **onStdout?**: (`chunk`) => `void` \| `Promise`\<`void`\>

Optional serialized stdout callback; exceptions cancel and drain the process.

#### Parameters

##### chunk

`string`

UTF-8 text decoded across native byte-fragment boundaries.

#### Returns

`void` \| `Promise`\<`void`\>

Optional asynchronous processing completion.

***

### signal?

> `readonly` `optional` **signal?**: `AbortSignal`

Cancellation stops and awaits the process tree.

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Elapsed timeout in milliseconds; default 5 minutes, at most 2147483647 for the native runner.

***

### workingDirectory

> `readonly` **workingDirectory**: `string`

Existing working directory for this process.
