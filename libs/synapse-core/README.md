# @pixel-brewery/synapse-core

Define an AI integration once, then compose the CLI drivers your application needs. Core supplies the shared requests, results, capabilities, events, authentication contracts and typed failures. It has no runtime dependencies or Node.js imports.

**Initial family version 0.0.1:** install the published package from public GitHub Packages after release verification. [Registry authentication](../../.docs/guides/consumers.md#install-from-github-packages) is required; source-repository access is separate. The package family uses native ESM and targets Node.js 24.15.0 or later.

## Preserve a continuation

Store the complete runtime-created reference, then restore it without changing its owner or authentication generation:

```ts
import {
    encodeSessionReference,
    parseSessionReference,
    type IAiRequest,
    type IAiResult,
} from '@pixel-brewery/synapse-core';

function storeContinuation(result: IAiResult): string | undefined {
    return result.session ? encodeSessionReference(result.session) : undefined;
}

function resumeRequest(request: IAiRequest, stored: string): IAiRequest {
    const session = parseSessionReference(stored);
    if (!session) throw new Error('This legacy native ID needs an explicit migration.');
    return { ...request, session };
}
```

The runtime checks driver, instance, profile, candidate and generation before resuming. Parsing a raw legacy native ID returns `undefined`; malformed envelopes fail as `session-unavailable`, while an unknown envelope version fails as `configuration`. A migration adapter must preserve the original ownership and leave a legacy generation absent. Assigning current credentials to an old ID would discard the protection.

## Compose around the contracts

Implement `AiDriverBase` for execution, `AiAuthDriverBase` for native authentication, or `AiRouteExecutorBase` for routing. Driver identities are open strings. Applications choose instances, prompts, models and policy; [runtime](../synapse-runtime/README.md), [authentication](../synapse-auth/README.md) and [routing](../synapse-routing/README.md) provide the corresponding implementations.

`IAiRunHandle` combines a bounded `AsyncIterable` with a separate result promise. `AiError` carries retry, capacity and session recovery metadata. `isCleanupIncomplete(error)` recognizes a bounded chain of cleanup faults; those failures are nonretryable host errors and require confirmed process cleanup before replacement runtime state is created. Concrete enforcement belongs to the runtime and selected driver.

See the [consumer guide](../../.docs/guides/consumers.md) and [generated API reference](../../.docs/packages/synapse-core/api/index.md).
