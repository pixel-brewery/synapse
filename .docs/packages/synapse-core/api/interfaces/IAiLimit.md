# Interface: IAiLimit

Provider-reported usage or capacity window.

## Properties

### kind

> `readonly` **kind**: `"quota"` \| `"rate"`

Short rate window or longer account quota.

***

### limit?

> `readonly` `optional` **limit?**: `number`

Total capacity in the same scale as remaining.

***

### remaining?

> `readonly` `optional` **remaining?**: `number`

Remaining units or percentage in the documented provider scale.

***

### resetsAt?

> `readonly` `optional` **resetsAt?**: `number`

Absolute UTC epoch milliseconds for the next reset.

***

### scope

> `readonly` **scope**: `"account"` \| `"model"`

Explicit provider scope; a model-only 429 does not block every account model.
