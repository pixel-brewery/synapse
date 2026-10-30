# Interface: IAiAuthStatus

Verified native CLI account state without reusable credential values.

## Properties

### accountId?

> `readonly` `optional` **accountId?**: `string`

Safe provider account identifier, if exposed.

***

### authenticated

> `readonly` **authenticated**: `boolean`

Whether the CLI verified an authenticated account.

***

### displayName?

> `readonly` `optional` **displayName?**: `string`

Safe account display name, if exposed.

***

### message?

> `readonly` `optional` **message?**: `string`

Safe bounded status explanation; never raw CLI output.

***

### method?

> `readonly` `optional` **method?**: `string`

Verified native authentication family, e.g. chatgpt, subscription or api-key; absent when unknown.

***

### plan?

> `readonly` `optional` **plan?**: `string`

Subscription/account plan metadata, if exposed.
