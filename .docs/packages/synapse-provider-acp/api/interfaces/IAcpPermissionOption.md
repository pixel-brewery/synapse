# Interface: IAcpPermissionOption

One native ACP permission decision, without raw tool inputs or credentials.

## Properties

### id

> `readonly` **id**: `string`

Native opaque option ID that may be returned by the host.

***

### kind

> `readonly` **kind**: `string`

Native permission family, such as allow_once or reject_once.

***

### label

> `readonly` **label**: `string`

Safe bounded display label.
