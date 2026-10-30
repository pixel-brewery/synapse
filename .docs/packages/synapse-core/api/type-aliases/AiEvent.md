# Type Alias: AiEvent

> **AiEvent** = \{ `category?`: `"status"` \| `"reasoning"` \| `"tool"` \| `"error"` \| `"output"` \| `"message"` \| `"file-change"` \| `"command"`; `message`: `string`; `type`: `"progress"`; \} \| \{ `text`: `string`; `type`: `"text"`; \} \| \{ `session`: [`IAiSessionReference`](../interfaces/IAiSessionReference.md); `type`: `"session"`; \} \| \{ `type`: `"usage"`; `usage`: [`IAiUsage`](../interfaces/IAiUsage.md); \} \| \{ `dropped`: `number`; `type`: `"overflow"`; \} \| \{ `candidateId`: `string`; `instanceId`: `string`; `type`: `"attempt"`; \}

Bounded normalized execution events, without raw protocol frames or credentials.

## Union Members

### Type Literal

\{ `category?`: `"status"` \| `"reasoning"` \| `"tool"` \| `"error"` \| `"output"` \| `"message"` \| `"file-change"` \| `"command"`; `message`: `string`; `type`: `"progress"`; \}

#### category?

> `readonly` `optional` **category?**: `"status"` \| `"reasoning"` \| `"tool"` \| `"error"` \| `"output"` \| `"message"` \| `"file-change"` \| `"command"`

Provider-neutral semantic category.

#### message

> `readonly` **message**: `string`

Safe bounded message.

#### type

> `readonly` **type**: `"progress"`

Event kind.

***

### Type Literal

\{ `text`: `string`; `type`: `"text"`; \}

#### text

> `readonly` **text**: `string`

Generated text delta.

#### type

> `readonly` **type**: `"text"`

Event kind.

***

### Type Literal

\{ `session`: [`IAiSessionReference`](../interfaces/IAiSessionReference.md); `type`: `"session"`; \}

#### session

> `readonly` **session**: [`IAiSessionReference`](../interfaces/IAiSessionReference.md)

Fully bound continuation reference.

#### type

> `readonly` **type**: `"session"`

Event kind.

***

### Type Literal

\{ `type`: `"usage"`; `usage`: [`IAiUsage`](../interfaces/IAiUsage.md); \}

#### type

> `readonly` **type**: `"usage"`

Event kind.

#### usage

> `readonly` **usage**: [`IAiUsage`](../interfaces/IAiUsage.md)

Latest cumulative usage snapshot.

***

### Type Literal

\{ `dropped`: `number`; `type`: `"overflow"`; \}

#### dropped

> `readonly` **dropped**: `number`

Count of oldest events dropped for a slow or absent consumer.

#### type

> `readonly` **type**: `"overflow"`

Event kind.

***

### Type Literal

\{ `candidateId`: `string`; `instanceId`: `string`; `type`: `"attempt"`; \}

#### candidateId

> `readonly` **candidateId**: `string`

Selected route candidate.

#### instanceId

> `readonly` **instanceId**: `string`

Selected instance.

#### type

> `readonly` **type**: `"attempt"`

Event kind.

## Nested type members

### `AiEvent[type="progress"].type`

Event kind.

### `AiEvent[type="progress"].message`

Safe bounded message.

### `AiEvent[type="progress"].category`

Provider-neutral semantic category.

### `AiEvent[type="text"].type`

Event kind.

### `AiEvent[type="text"].text`

Generated text delta.

### `AiEvent[type="session"].type`

Event kind.

### `AiEvent[type="session"].session`

Fully bound continuation reference.

### `AiEvent[type="usage"].type`

Event kind.

### `AiEvent[type="usage"].usage`

Latest cumulative usage snapshot.

### `AiEvent[type="overflow"].type`

Event kind.

### `AiEvent[type="overflow"].dropped`

Count of oldest events dropped for a slow or absent consumer.

### `AiEvent[type="attempt"].type`

Event kind.

### `AiEvent[type="attempt"].instanceId`

Selected instance.

### `AiEvent[type="attempt"].candidateId`

Selected route candidate.
