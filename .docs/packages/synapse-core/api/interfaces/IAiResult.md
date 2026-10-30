# Interface: IAiResult

Final result of the same execution represented by the event handle.

## Properties

### candidateId

> `readonly` **candidateId**: `string`

Actual route candidate selected by the host routing policy.

***

### driverId

> `readonly` **driverId**: `string`

Driver that completed this execution.

***

### instanceId

> `readonly` **instanceId**: `string`

Instance that completed this execution.

***

### profileId

> `readonly` **profileId**: `string`

Application/account profile used by this execution.

***

### session?

> `readonly` `optional` **session?**: [`IAiSessionReference`](IAiSessionReference.md)

Continuation reference bound to the actual selected execution owner.

***

### structured?

> `readonly` `optional` **structured?**: `unknown`

Locally schema-validated result, present when a schema was requested.

***

### text

> `readonly` **text**: `string`

Final generated text.

***

### usage?

> `readonly` `optional` **usage?**: [`IAiUsage`](IAiUsage.md)

Latest cumulative execution usage.
