# Interface: IAiProfilePaths

Filesystem locations explicitly owned by one application/account profile.

## Properties

### configuration

> `readonly` **configuration**: `string`

CLI configuration location, mapped explicitly for legacy profiles.

***

### credentials

> `readonly` **credentials**: `string`

Native CLI credential location; never a token value.

***

### execution

> `readonly` **execution**: `string`

Execution-only state, separate from credentials when supported.

***

### home

> `readonly` **home**: `string`

Isolated HOME/USERPROFILE directory used by the CLI.

***

### root

> `readonly` **root**: `string`

Profile root, normally a private application-owned directory.

***

### sqlite?

> `readonly` `optional` **sqlite?**: `string`

Optional native CLI database directory; host application databases are separate.

***

### temporary

> `readonly` **temporary**: `string`

Private temporary directory for profile-owned subprocess files.
