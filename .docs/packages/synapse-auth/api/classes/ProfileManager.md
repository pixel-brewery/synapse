# Class: ProfileManager

Creates isolated application/account directories without importing global credentials.

## Remarks

Reuse one manager for all profiles in a host. Version 1 ownership markers reserve
every canonical profile directory across manager instances, including explicit legacy mappings.
Ancestor and descendant checks reject foreign overlapping claims. Each of the two inspection
passes visits at most 4,096 directories, 32,768 entries and 64 nested levels without following
directory symlinks; mappings that cannot be verified within those limits fail closed.
Claims already written before an initialization failure remain reserved; the same identity
and mapping can reopen them. Existing native files are never copied or removed.
Reopening a legacy version 1 profile backfills missing sidecars. Previously unmarked external
directories have no discoverable persistent owner until they are explicitly claimed.
POSIX directories/files use 0700/0600; Windows hosts supply a private ACL-protected base.

## Constructors

### Constructor

> **new ProfileManager**(`options`): `ProfileManager`

Captures profile storage policy without creating directories or reading accounts.

#### Parameters

##### options

[`IProfileManagerOptions`](../interfaces/IProfileManagerOptions.md)

Application-owned storage and bounded mapping policy.

#### Returns

`ProfileManager`

#### Throws

An AiError when the root is not absolute or the limit is invalid.

## Methods

### create()

> **create**(`request`): `Promise`\<[`IAiProfile`](../../../synapse-core/api/interfaces/IAiProfile.md)\>

Creates or reopens one immutable isolated profile, preserving explicit legacy mappings.

#### Parameters

##### request

[`IProfileRequest`](../interfaces/IProfileRequest.md)

Application, account, driver and optional legacy locations.

#### Returns

`Promise`\<[`IAiProfile`](../../../synapse-core/api/interfaces/IAiProfile.md)\>

Stable identity and normalized absolute native paths, preserving explicit legacy spellings.

#### Throws

An AiError for ownership/path collisions, unsupported markers or filesystem failure.

#### Remarks

Existing credentials and sessions are preserved. No global login state is copied.
Every distinct mapped directory, including sqlite, receives a private ownership sidecar.
A failed initialization retains completed ownership claims for a retry with the same mapping.
