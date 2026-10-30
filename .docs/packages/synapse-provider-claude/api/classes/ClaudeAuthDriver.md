# Class: ClaudeAuthDriver

Native subscription, console and SSO authentication without a Synapse token broker.

## Extends

- [`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md)

## Constructors

### Constructor

> **new ClaudeAuthDriver**(`_runner`): `ClaudeAuthDriver`

Creates an inert native authentication adapter.

#### Parameters

##### \_runner

[`ProcessRunnerBase`](../../../synapse-runtime/api/classes/ProcessRunnerBase.md)

Subprocess owner shared with this Claude driver's execution.

#### Returns

`ClaudeAuthDriver`

#### Overrides

`AiAuthDriverBase.constructor`

## Methods

### login()

> **login**(`context`): `Promise`\<`void`\>

Runs one explicitly selected native browser procedure with optional manual-code input.

#### Parameters

##### context

[`IAiAuthContext`](../../../synapse-core/api/interfaces/IAiAuthContext.md)

Isolated expiring auth operation and correlated host interaction owner.

#### Returns

`Promise`\<`void`\>

Completion of native login; the auth manager performs final verification.

#### Throws

An AiError for unsupported methods, invalid responses or native rejection.

#### Overrides

`AiAuthDriverBase.login`

***

### logout()

> **logout**(`instance`, `signal`): `Promise`\<`void`\>

Signs out only the selected native configuration/keychain service.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Isolated account configuration and secure-storage identity.

##### signal

`AbortSignal`

Logout cancellation controlled by the shared auth owner.

#### Returns

`Promise`\<`void`\>

Native logout completion after owned subprocess cleanup.

#### Throws

An AiError when the native command fails.

#### Overrides

`AiAuthDriverBase.logout`

***

### methods()

> **methods**(`_instance`): readonly [`IAiAuthMethod`](../../../synapse-core/api/interfaces/IAiAuthMethod.md)[]

Lists only procedures supported by the characterized native CLI.

#### Parameters

##### \_instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Selected account; discovery does not inspect credentials.

#### Returns

readonly [`IAiAuthMethod`](../../../synapse-core/api/interfaces/IAiAuthMethod.md)[]

Native subscription, console and SSO browser procedures.

#### Overrides

`AiAuthDriverBase.methods`

***

### status()

> **status**(`instance`, `signal`): `Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Verifies the selected native profile without login, inference or MCP sessions.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Isolated configuration and secure-storage identity.

##### signal

`AbortSignal`

Inspection cancellation.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Safe native account metadata.

#### Throws

An AiError for malformed native status or process failure.

#### Overrides

`AiAuthDriverBase.status`
