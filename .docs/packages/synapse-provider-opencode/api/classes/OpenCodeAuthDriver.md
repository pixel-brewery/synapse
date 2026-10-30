# Class: OpenCodeAuthDriver

Native OpenCode login/logout procedures scoped to one configured provider account.

## Extends

- [`AiAuthDriverBase`](../../../synapse-core/api/classes/AiAuthDriverBase.md)

## Constructors

### Constructor

> **new OpenCodeAuthDriver**(`_runner`): `OpenCodeAuthDriver`

Creates an inert native authentication adapter.

#### Parameters

##### \_runner

[`ProcessRunnerBase`](../../../synapse-runtime/api/classes/ProcessRunnerBase.md)

Shared owned-process execution boundary.

#### Returns

`OpenCodeAuthDriver`

#### Overrides

`AiAuthDriverBase.constructor`

## Methods

### login()

> **login**(`context`): `Promise`\<`void`\>

Runs the configured native method and presents only safe login interactions.

#### Parameters

##### context

[`IAiAuthContext`](../../../synapse-core/api/interfaces/IAiAuthContext.md)

Exclusive profile flow with correlated owner-validated responses.

#### Returns

`Promise`\<`void`\>

Completion after the native login process exits successfully.

#### Throws

An AiError for unsupported procedures, native login failure or cancellation.

#### Overrides

`AiAuthDriverBase.login`

***

### logout()

> **logout**(`instance`, `signal`): `Promise`\<`void`\>

Logs out only the configured native provider in this isolated profile.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Account profile after shared auth admission has drained its executions.

##### signal

`AbortSignal`

Logout cancellation.

#### Returns

`Promise`\<`void`\>

Completion of the native credential removal.

#### Throws

An AiError if provider selection is missing or native logout fails.

#### Overrides

`AiAuthDriverBase.logout`

***

### methods()

> **methods**(`instance`): readonly [`IAiAuthMethod`](../../../synapse-core/api/interfaces/IAiAuthMethod.md)[]

Reports the native procedure only when provider and method selection are explicit.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Isolated instance containing the provider's native login method label.

#### Returns

readonly [`IAiAuthMethod`](../../../synapse-core/api/interfaces/IAiAuthMethod.md)[]

Supported native procedures; an unconfigured selector advertises none.

#### Overrides

`AiAuthDriverBase.methods`

***

### status()

> **status**(`instance`, `signal`): `Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Reads the CLI's isolated stored-credential listing without login or inference.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Account profile whose native credentials are inspected.

##### signal

`AbortSignal`

Bounded inspection cancellation.

#### Returns

`Promise`\<[`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)\>

Whether OpenCode lists credentials for the configured account.

#### Throws

An AiError when the native status command fails.

#### Remarks

Stored credentials do not prove a provider subscription entitlement or remote token validity.

#### Overrides

`AiAuthDriverBase.status`
