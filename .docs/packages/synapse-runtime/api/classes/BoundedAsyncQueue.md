# Class: BoundedAsyncQueue\<T\>

Single-consumer event queue whose producer never waits for optional observation.

## Type Parameters

### T

`T`

Event or state snapshot delivered to the consumer.

## Implements

- `AsyncIterable`\<`T`\>

## Constructors

### Constructor

> **new BoundedAsyncQueue**\<`T`\>(`_capacity?`, `_overflowFactory?`): `BoundedAsyncQueue`\<`T`\>

Creates a bounded queue without starting work or timers.

#### Parameters

##### \_capacity?

`number` = `256`

Maximum retained values; a positive safe integer, default 256.

##### \_overflowFactory?

(`dropped`) => `T`

Optional summary emitted before retained values after overflow.

#### Returns

`BoundedAsyncQueue`\<`T`\>

#### Throws

An AiError when capacity is invalid.

## Methods

### \[asyncIterator\]()

> **\[asyncIterator\]**(): `AsyncIterator`\<`T`\>

Claims the queue's single iterator; hosts may multicast its events externally.

#### Returns

`AsyncIterator`\<`T`\>

Iterator over retained values and optional overflow summaries.

#### Throws

An AiError when another consumer already claimed the stream.

#### Remarks

Returning from observation does not cancel the separate operation.

#### Implementation of

`AsyncIterable.[asyncIterator]`

***

### close()

> **close**(): `void`

Ends observation after retained values drain, independently of the operation result.

#### Returns

`void`

***

### push()

> **push**(`value`): `void`

Publishes a value, dropping the oldest retained value when capacity is exhausted.

#### Parameters

##### value

`T`

Immutable event/state snapshot; late values after closure are ignored.

#### Returns

`void`
