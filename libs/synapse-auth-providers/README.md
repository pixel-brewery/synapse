# @pixel-brewery/synapse-auth-providers

Optional backend API-key verification for OpenAI, Anthropic, Gemini, Mistral and OpenRouter. These adapters implement `ApiKeyVerifierBase` from `@pixel-brewery/synapse-auth` and perform fixed, non-inference metadata requests. They require no installed AI CLI.

**This works with Vercel AI SDK.** Synapse owns connection authentication, correlated secret input and credential lifecycle; the application configures its AI SDK provider with the same stored key. Vercel AI SDK owns model calls, streaming and tools. This package adds no AI SDK dependency, model wrapper, inference gateway or model catalog.

Requires Node.js 24.15+ and native ESM. Keep it on the same Synapse family version as Auth and Core. Install a verified published version after [registry verification](../../.docs/guides/releases.md#first-publication-and-verification) and [registry authentication](../../.docs/guides/consumers.md#install-from-github-packages); verified local archives are also supported.

## Select an authentication verifier

Import concrete adapters only from their provider subpath:

```ts
import { OpenAiApiKeyVerifier } from '@pixel-brewery/synapse-auth-providers/openai';
import { AnthropicApiKeyVerifier } from '@pixel-brewery/synapse-auth-providers/anthropic';
import { GeminiApiKeyVerifier } from '@pixel-brewery/synapse-auth-providers/gemini';
import { MistralApiKeyVerifier } from '@pixel-brewery/synapse-auth-providers/mistral';
import { OpenRouterApiKeyVerifier } from '@pixel-brewery/synapse-auth-providers/openrouter';
```

The package root exports only shared transport contracts and `NodeApiKeyVerificationTransport`. Importing one provider subpath does not register the others. No constructor reads credentials, starts a CLI, requests login or contacts a provider.

Every verification issues one authenticated GET. The catalog endpoints are used only as authentication probes; their returned models are validated and discarded. OpenRouter uses authenticated current-key metadata instead of its public model catalog.

| Provider/subpath         | Fixed endpoint                                                       | Authentication and protocol headers                                                              | API version         | Optional selectors                                                   |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------- |
| OpenAI `/openai`         | `https://api.openai.com/v1/models`                                   | `Authorization: Bearer <key>`                                                                    | `v1` path           | `organization` → `OpenAI-Organization`; `project` → `OpenAI-Project` |
| Anthropic `/anthropic`   | `https://api.anthropic.com/v1/models?limit=1`                        | `Authorization: Bearer <key>`; `anthropic-version: 2026-10-21`; `Content-Type: application/json` | `2026-10-21` header | `workspaceId` → `anthropic-workspace-id`                             |
| Gemini `/gemini`         | `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1` | `x-goog-api-key: <key>`                                                                          | `v1beta` path       | None; Gemini Developer API only                                      |
| Mistral `/mistral`       | `https://api.mistral.ai/v1/models`                                   | `Authorization: Bearer <key>`                                                                    | `v1` path           | None                                                                 |
| OpenRouter `/openrouter` | `https://openrouter.ai/api/v1/key`                                   | `Authorization: Bearer <key>`                                                                    | `v1` path           | None                                                                 |

Endpoint and header references: [OpenAI authentication](https://developers.openai.com/api/reference/overview#authentication), [OpenAI models](https://developers.openai.com/api/reference/resources/models), [Anthropic models](https://platform.claude.com/docs/en/api/models/list), [Anthropic authentication](https://platform.claude.com/docs/en/api/overview#authentication), [Gemini models](https://ai.google.dev/api/models#method:-models.list), [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key), [Mistral models](https://docs.mistral.ai/api/endpoint/models), [OpenRouter current-key metadata](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key). These contracts were checked against the official documentation on 2026-11-01; no personal account request was used as evidence.

## Compose with Synapse authentication

The host supplies `ApiKeyStoreBase`, its durable encrypted secret store. Select one verifier and pass it to `ApiKeyAuthDriver`, then use the existing `AuthManager` credentials flow:

```ts
import { ApiKeyAuthDriver, AuthManager } from '@pixel-brewery/synapse-auth';
import type { ApiKeyStoreBase } from '@pixel-brewery/synapse-auth';
import { OpenAiApiKeyVerifier } from '@pixel-brewery/synapse-auth-providers/openai';
import type { IOpenAiApiKeyVerifierOptions } from '@pixel-brewery/synapse-auth-providers/openai';
import type { ProfileAccessCoordinator } from '@pixel-brewery/synapse-runtime';

export function createOpenAiAuthentication(
    secretStore: ApiKeyStoreBase,
    access: ProfileAccessCoordinator,
    selectors: IOpenAiApiKeyVerifierOptions = {},
) {
    const verifier = new OpenAiApiKeyVerifier(undefined, selectors);
    const apiKeys = new ApiKeyAuthDriver(secretStore, verifier);
    const authentication = new AuthManager(access);

    return { apiKeys, authentication };
}
```

The host first authorizes the application user and connection, then starts method `api-key`. Synapse requests secret field `apiKey`, verifies the candidate before atomic storage replacement and performs a separate status check before reporting success. A normal successful login therefore invokes verification twice. Retain `IAuthHandle` on the backend; the browser receives only safe states and the active interaction's correlation data.

The complete storage scope is `applicationId`, `accountId`, `driverId`, `instanceId` and `profileId`. Use the exported `apiKeyCredentialScope(instance)` from `@pixel-brewery/synapse-auth` for both the authentication store and later backend secret reads. It derives identity; the host still owns authorization. No default secret persistence, encryption key or cloud account is selected by Synapse.

## Use the stored key with Vercel AI SDK

In the consuming backend, resolve the same authorized connection's key and configure the AI SDK provider. `@ai-sdk/openai` belongs to that application, not this Synapse package:

```ts
import { createOpenAI } from '@ai-sdk/openai';
import { apiKeyCredentialScope } from '@pixel-brewery/synapse-auth';
import type { ApiKeyStoreBase } from '@pixel-brewery/synapse-auth';
import type { IOpenAiApiKeyVerifierOptions } from '@pixel-brewery/synapse-auth-providers/openai';
import { AiError } from '@pixel-brewery/synapse-core';
import type { IAiInstance } from '@pixel-brewery/synapse-core';

export async function createConnectionOpenAiProvider(
    secretStore: ApiKeyStoreBase,
    instance: IAiInstance,
    signal: AbortSignal,
    selectors: IOpenAiApiKeyVerifierOptions = {},
) {
    signal.throwIfAborted();

    const apiKey = await secretStore.read(apiKeyCredentialScope(instance), signal);

    signal.throwIfAborted();

    if (!apiKey) throw new AiError('auth-required', 'This connection has no stored API key.');

    return createOpenAI({
        apiKey,
        organization: selectors.organization,
        project: selectors.project,
    });
}
```

This factory configures a provider without invoking a model. Use the same OpenAI organization/project selectors for verification and the AI SDK provider. Its documented `createOpenAI` settings support this explicit key and those selectors. [Vercel AI SDK OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai#provider-instance)

Resolve/configure the provider while holding the connection's shared profile execution lease. Keep that lease until the later AI SDK operation and any stream cleanup finish, and propagate its cancellation to the SDK call. Do not retain provider instances with stale credentials across account changes. Synapse does not wrap AI SDK model interfaces or coordinate other libraries automatically. See [cloud authentication](../../.docs/guides/cloud-authentication.md#use-with-vercel-ai-sdk) for the full ownership boundary and existing profile-storage requirements.

## Verification meaning and limits

`authenticated: true` means the provider accepted the supplied credential for the chosen metadata endpoint and the response matched that endpoint's expected shape. It does not prove inference permission, entitlement to any particular model, an active subscription, sufficient credits or remaining quota. The adapters return only safe `authenticated`/`method` state, never a key, catalog, account payload or provider error body.

HTTP 401/403 leave this probe unverified. A restricted key or project policy can deny metadata access even when the credential is usable elsewhere. In particular, OpenAI keys need permission to list models for this verifier. Google can also explicitly reject a key using its structured HTTP 400 `API_KEY_INVALID` response. Rate limiting and service failures throw safe errors rather than declaring the key invalid. No inference request or automatic retry is used to repair a failed check.

The native Node transport defaults to a 5-second total request deadline, a 1 MiB response limit and 64 concurrent requests. It validates public HTTPS/DNS at connection time, pins the connection destination, rejects credential-bearing redirects and compressed responses, and awaits owned connection cleanup. Inject another `ApiKeyVerificationTransportBase` for a host-owned transport with equivalent guarantees. Transport customization does not change the concrete verifier's fixed provider endpoint.

Existing CLI/ACP authentication remains available through its selected native packages. ChatGPT subscription access is a different authentication path; hosted Sign in with ChatGPT is a future Resonanz Cloud integration requiring a confirmed registration. This package supplies API-key verification and does not implement that OAuth flow. See [API keys and ChatGPT subscription access](../../.docs/guides/cloud-authentication.md#api-keys-and-chatgpt-subscription-access).
