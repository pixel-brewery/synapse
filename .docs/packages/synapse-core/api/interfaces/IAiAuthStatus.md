# Interface: IAiAuthStatus

Driver-reported account authentication state without reusable credential values.

## Properties

### accountId?

> `readonly` `optional` **accountId?**: `string`

Safe provider account identifier, if exposed.

***

### authenticated

> `readonly` **authenticated**: `boolean`

Whether the driver's verification mechanism accepted the account's authentication.
Host-managed API keys require a host-owned verifier; stored key presence alone is insufficient.

***

### displayName?

> `readonly` `optional` **displayName?**: `string`

Safe account display name, if exposed.

***

### message?

> `readonly` `optional` **message?**: `string`

Safe bounded status explanation; never raw provider output or credential values.

***

### method?

> `readonly` `optional` **method?**: `string`

Authentication family established by the driver, e.g. chatgpt, subscription or api-key; absent when unknown.

***

### plan?

> `readonly` `optional` **plan?**: `string`

Subscription/account plan metadata, if exposed.
