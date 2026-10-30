# Function: createProfileEnvironment()

> **createProfileEnvironment**(`instance`, `extras?`): `Promise`\<`Readonly`\<`Record`\<`string`, `string`\>\>\>

Captures an allowlisted host environment and prepares one explicit isolated profile.

## Parameters

### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Selected application/account instance, including explicit optional secrets.

### extras?

`Readonly`\<`Record`\<`string`, `string`\>\> = `{}`

Driver-owned environment values such as its native credential/config paths.

## Returns

`Promise`\<`Readonly`\<`Record`\<`string`, `string`\>\>\>

Environment for this profile; HOME, USERPROFILE and temporary paths remain isolated.

## Throws

An AiError when profile locations are invalid or cannot be prepared.

## Remarks

No credentials are discovered or imported from the user's global CLI configuration.
