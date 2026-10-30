# Function: importOpenCodeCredentials()

> **importOpenCodeCredentials**(`sourceFile`, `instance`): `Promise`\<`void`\>

Explicitly copies a native OpenCode credential file into one isolated application profile.

## Parameters

### sourceFile

`string`

Exact user-selected existing auth.json file; never discovered automatically.

### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Destination application/account profile.

## Returns

`Promise`\<`void`\>

Completion after a validated private temporary file is atomically renamed into place.

## Throws

An AiError for invalid files, oversized data or host filesystem failure.

## Remarks

This is a host-triggered credential mutation. Call it through the shared coordinator's `credentialChange(instance.profile, action)` to drain affected executions and invalidate their persistent session generation before copying credentials.
