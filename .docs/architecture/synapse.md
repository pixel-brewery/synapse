# Synapse architecture and implementation plan

Synapse is a standalone MIT TypeScript package family for local AI integration through installed CLIs. Node.js 24.15+ is the baseline; macOS, Linux and native Windows are target platforms. Symphony is the first production consumer. A separate meeting application can supply transcribed text through the same contracts; audio capture and transcription infrastructure remain outside this library.

## Boundaries

The nine explicit packages separate neutral contracts, runtime, auth, routing, four provider adapters and testing. Core has no Node.js or provider dependency. Runtime knows only driver contracts. Auth uses runtime profile gates. Routing uses neutral execution contracts and injected storage. Applications compose the adapters they need and own business prompts, approvals, workflows, model catalogs, durable databases and presentation.

Native ESM modules, declarations, explicit exports and `sideEffects: false` are binding packaging contracts. Imports and constructors do not start discovery, processes, login, timers or network traffic. Installation and updates of external CLIs are explicit host actions. Packages initially share a version.

The mandatory [Synapse Architect](../../.agents/skills/synapse-architect/SKILL.md) retains Archipel's complete shared foundations with local framework-neutral interpretations. Public APIs require English TSDoc and generated portable Markdown plus reflection JSON. TypeDoc and typedoc-plugin-markdown are the documentation tools inherited from Archipel's approach.

## Execution, authentication and sessions

A driver implements an open provider/protocol identity. An instance supplies concrete configuration and a profile. Each application/account profile owns native home, configuration, credentials, execution and temporary paths. Explicit path mappings preserve Symphony's existing native storage.

`AiRuntime.run` provides one result promise and an optional bounded event stream. Text jobs and agent turns share the contract. Requests specify target, policy, model, prompt, workspace, optional session, deadline and cancellation. Missing declared capabilities reject before provider launch; ACP additionally checks negotiated capabilities before submitting a prompt. Native JSON output is used where available and validated locally; otherwise the runtime validates returned JSON itself.

Authentication is an explicit operation with correlated owner, operation and interaction identifiers, expiry, verification and cancellation. Drivers advertise only actual native methods. The same profile coordinator blocks execution and drains active processes before login, logout, account import or configuration changes. No managed OAuth/token broker is introduced in the first delivery.

Session references retain driver, instance, profile, candidate and original authentication generation. Account changes persist a fresh generation before credentials mutate, including failed or cancelled attempted transitions. Explicit configuration-source changes are detected across restarts through a canonical digest; no plaintext credentials are stored in that metadata. Initial legacy sessions remain usable until such a transition. Full versioned references fit existing opaque host persistence fields. Foreign or obsolete references are rejected before inference.

Processes use executable resolution, argument vectors and stdin with controlled environments, bounded output and deadlines. Abort and disposal await owned cleanup. Authentication errors, quota pauses, cancellation, protocol failures, invalid results, host failures and persistence errors remain distinguishable. A failed turn need not make its native session unusable.

Unconfirmed process termination is an explicit nonretryable host failure (`cleanupIncomplete`). Its affected profile remains blocked in the active coordinator, credential changes and refresh commits do not proceed, and subsequent disposal still reports the failure. A host must confirm process termination before replacing that coordinator. This prevents a failed native cleanup from being treated as a successful authentication drain.

## Routing and host migration

Hosts supply eligible candidates, cost classes and policy. Per-runtime queues, concurrency, quota pauses and circuit state use injected storage. Only explicitly repeatable requests may fail over automatically; writes require host authorization. Cancellation or failed result/progress persistence never starts another provider execution. Sessions are not passed to a different candidate; only explicit host context crosses providers.

Symphony retains `WorkspaceAgentRuntime`, analysis/solution/issue prompts, domain progress contracts, SQLite and worktree ownership. Shared Synapse adapters own native execution and authentication. Existing workspace/connection identifiers and directory mappings remain supported. The migration replaces the old technical implementations rather than maintaining parallel execution paths.

## Delivery sequence and acceptance

1. Characterize existing native protocols, authentication, resume and routing using sanitized replay fixtures and host parity tests.
2. Establish the independent Yarn/Nx workspace, architecture skill, provider client projections, ESM packaging and documentation gates.
3. Implement neutral contracts, bounded runtime, profiles, native auth and session lifecycle, with Windows behavior designed at the process boundary.
4. Extract Codex exec/JSON, Claude Code CLI and OpenCode noninteractive behavior individually; add official ACP stdio support behind the same driver seam.
5. Generalize routing and migrate Symphony through its existing business facade while preserving settings and storage paths.
6. Ship a standalone synthetic meeting-text example and actual archive-consumer verification.
7. Complete serial local verification, generated API documentation, provenance and publishable artifacts. Publication itself is an explicit owner action.

Acceptance covers profile/account isolation, stale auth responses, process fragmentation and limits, cancellation races, session generations, safe retry policy and Symphony workflow parity. Packed archives must resolve without workspace aliases, remain inert on import and exclude unrelated providers from Codex-only esbuild/Rollup bundles. Regular CI needs no personal AI accounts. The CI matrix configures native Windows and Linux verification; completed jobs are still required as release evidence. Live account tests are explicitly initiated. The [compatibility guide](../guides/cli-compatibility.md) distinguishes current evidence from configured coverage. Symphony's required integration gates are `yarn verify`, `yarn e2e` and `yarn forge:package`; a requested PR additionally requires the local Ship-it review.

## AI SDK evaluation and exclusion

Synapse does not depend on Vercel AI SDK. Its boundary is native authentication, execution, sessions and routing; applications retain business prompts and workflows. An SDK model abstraction does not remove the need to coordinate native profile ownership, credential changes, session generations and process cleanup.

AI SDK's public provider contract and community CLI adapters make interoperability technically possible. A consumer that already uses `generateText`, `streamText` or structured-output helpers may evaluate a separate adapter for that application. No Synapse adapter package, gateway or SDK agent loop is part of the current architecture.

Any future consumer bridge would need one execution/retry owner, cancellation that awaits native cleanup, accurate session/usage mapping and capability checks. Native autonomous CLI tools are not interchangeable with SDK tool callbacks. Progress events also do not necessarily provide token-level text streaming.

The [source-backed comparison](../guides/comparison.md#ai-sdk-community-adapters) records reviewed Codex CLI, Claude Code, OpenCode and ACP adapters, their SDK majors and transport differences. Check actual peer dependencies rather than assuming every community listing uses the same major. Audio capture/transcription remains separate from Synapse's meeting-text example.

Primary references: [custom provider specification](https://ai-sdk.dev/providers/community-providers/custom-providers), [structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data), [retry and cancellation settings](https://ai-sdk.dev/docs/ai-sdk-core/settings), [Codex CLI adapter](https://ai-sdk.dev/providers/community-providers/codex-cli), [Claude Code adapter](https://ai-sdk.dev/providers/community-providers/claude-code), [OpenCode adapter](https://ai-sdk.dev/providers/community-providers/opencode-sdk), [ACP adapter](https://ai-sdk.dev/providers/community-providers/acp).

## References and decisions

T3 Code informed driver/instance/profile separation and explicit auth/session lifecycle. Coding Agent Runner informed the execution boundary; Agents Wire informed routing and pools; Unigent informed typed results; Archipel informed package/source conventions and documentation. Synapse owns its contracts and has no mandatory Effect runtime.

[Native streaming](streaming.md) records the RxJS evaluation. Promise, AsyncIterable and AbortSignal cover the current requirements without adding RxJS. Reconsider only for a demonstrated composition requirement; an observable facade can remain an optional consumer concern.
