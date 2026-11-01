# Function: apiKeyCredentialScope()

> **apiKeyCredentialScope**(`instance`): [`IApiKeyCredentialScope`](../interfaces/IApiKeyCredentialScope.md)

Captures the canonical storage identity for one authorized API-key connection.

## Parameters

### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Backend-selected application/account/provider connection; never browser authority.

## Returns

[`IApiKeyCredentialScope`](../interfaces/IApiKeyCredentialScope.md)

A detached, frozen scope shared by authentication and backend secret resolution.

## Throws

An AiError when any identity is empty, contains controls or exceeds 512 characters.

## Remarks

This function performs no credential read or authorization. The backend first resolves
the authorized instance, then uses this same scope with ApiKeyStoreBase when configuring its
Vercel AI SDK provider. No native paths, instance environment or credential values are copied.
