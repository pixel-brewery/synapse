# Interface: IInteractiveProcess

Explicit stdin and termination controls for a live native authentication process.

## Methods

### end()

> **end**(): `void`

Closes stdin after the final native procedure input.

#### Returns

`void`

***

### stop()

> **stop**(): `Promise`\<`void`\>

Stops and awaits the owned process tree.

#### Returns

`Promise`\<`void`\>

Completion of bounded process-tree cleanup.

***

### write()

> **write**(`value`): `void`

Writes input to the owned process without logging its contents.

#### Parameters

##### value

`string`

Native procedure input, possibly a secret.

#### Returns

`void`
