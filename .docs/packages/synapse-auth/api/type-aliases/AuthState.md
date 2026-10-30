# Type Alias: AuthState

> **AuthState** = [`IAuthOperationIdentity`](../interfaces/IAuthOperationIdentity.md) & (\{ `state`: `"starting"`; \} \| \{ `interaction`: [`IAiAuthInteraction`](../../../synapse-core/api/interfaces/IAiAuthInteraction.md); `state`: `"waiting"`; \} \| \{ `state`: `"verifying"`; \} \| \{ `state`: `"succeeded"`; `status`: [`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md); \} \| \{ `error`: \{ `code`: [`AiErrorCode`](../../../synapse-core/api/type-aliases/AiErrorCode.md); `message`: `string`; \}; `state`: `"failed"`; \} \| \{ `reason`: `"cancelled"` \| `"expired"`; `state`: `"cancelled"`; \})

Correlated authentication lifecycle snapshots containing no submitted credential values.

## Nested type members

### `AuthState[state="starting"].state`

Credential access is reserved while prior native work drains.

### `AuthState[state="waiting"].state`

A current native interaction requires user attention.

### `AuthState[state="waiting"].interaction`

Safe instructions whose expiry never exceeds the flow expiry.

### `AuthState[state="verifying"].state`

Native completion or a response is being verified.

### `AuthState[state="succeeded"].state`

Native status confirmed authentication after login completed.

### `AuthState[state="succeeded"].status`

Safe verified account metadata.

### `AuthState[state="failed"].state`

The native login or its verification failed.

### `AuthState[state="failed"].error`

Safe failure classification without provider output or secret values.

### `AuthState[state="failed"].error.code`

Stable provider-neutral failure category.

### `AuthState[state="failed"].error.message`

Fixed safe explanation of the failure.

### `AuthState[state="cancelled"].state`

The operation was cancelled and all owned work has settled.

### `AuthState[state="cancelled"].reason`

Whether explicit cancellation or expiry ended the flow.
