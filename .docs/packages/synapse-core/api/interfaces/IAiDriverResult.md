# Interface: IAiDriverResult

One native turn outcome before runtime binding and schema validation.

## Properties

### sessionId?

> `readonly` `optional` **sessionId?**: `string`

Native session identifier returned by this driver.

***

### structured?

> `readonly` `optional` **structured?**: `unknown`

Optional native structured result; still validated against the requested schema.

***

### text

> `readonly` **text**: `string`

Final generated text, separate from progress or thinking output.

***

### usage?

> `readonly` `optional` **usage?**: [`IAiUsage`](IAiUsage.md)

Latest cumulative usage for this execution.
