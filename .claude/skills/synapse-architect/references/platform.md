# Runtime, profile and provider lifecycle

Use common Platform and Integration integrity with the Synapse scope translations in `SKILL.md`.

## Configuration and isolation

The host passes typed configuration and allowed candidates. Capture environment at an explicit runtime/bootstrap boundary; providers receive an allowlisted, profile-specific environment. No ambient credential discovery during import or background inspection. API keys are optional explicit host inputs, never a prerequisite.

Profiles isolate each application and account, including homes, CLI config, credentials, temporary/runtime files and sessions. Existing legacy directories are supported through explicit mappings. Do not symlink unrelated account state or copy global credentials silently. Native keychain integration follows the actual platform owner and does not weaken profile ownership.

For backend-only API-key authentication, reuse `AuthManager` with `ApiKeyAuthDriver`, `ApiKeyStoreBase` and `ApiKeyVerifierBase`. No CLI or inference driver is required. The host derives authorized connection identities, persists encrypted secrets and performs bounded non-inference verification with its chosen provider client. Use the complete application/account/driver/instance/profile scope, verify before replacing a key, and distinguish disconnecting a stored key from upstream revocation. Keys never belong in public states or browser persistence. Profile/session metadata and coordinator usage remain backend-owned; multi-process coordination belongs to the host.

The optional `synapse-auth-providers` package supplies fixed official HTTPS metadata probes for five providers. Import a selected provider subpath; its default shared transport bounds deadlines, response size and concurrency, validates public HTTPS connections and refuses redirects. Keys travel only in headers. A successful check establishes metadata access, not model entitlement or available budget; 403 may mean insufficient probe permission rather than an invalid key. Vercel AI SDK remains the Resonanz API execution owner. Resolve the same stored key using the canonical `apiKeyCredentialScope` helper and configure the SDK on the backend; do not add inference SDK dependencies or model calls to the verifier package.

Native CLI installation/update is an explicitly requested host action. Discovery/status checks are bounded and never launch login, inference, hooks or MCP sessions.

## Process and execution ownership

Start resolved executables with argument arrays and stdin. Define native Windows PATH/PATHEXT, executable/shim and escaping behavior; never concatenate untrusted shell commands. Bound stdout/stderr, fragmented frames, event queues, input size, deadlines, concurrency and temporary storage. Secrets and untrusted command output do not become public progress text by default.

Track owned process trees. Abort, timeout, auth switching and `dispose()` must stop and await their termination, including startup races and Windows descendants. Cleanup is idempotent and bounded; do not kill unrelated processes. A host progress failure cancels the live execution before propagating and never retries it.

Text jobs use an owned workspace without requiring Git. Product target-project worktree preparation stays in Symphony or another host. Read-only analysis rejects unsupported declared capability/policy before launch. ACP additionally validates negotiated capabilities and the selected native mode before any prompt is submitted.

## Authentication and sessions

The shared lifecycle owns starting, interaction, verification, success, failure and cancellation. Bind operation/owner/interaction IDs and expiry. Support actual CLI browser/device-code/terminal/credentials procedures through extensible contracts. Never advertise a procedure the driver cannot perform.

Authentication adapters may be composed without an execution driver. Direct API execution remains with the application's inference SDK. An official hosted ChatGPT OAuth adapter must use confirmed application registration and granted scopes; native Codex client identities or an OSS loopback flow do not establish a cloud application's entitlement.

Block new execution during login/logout/account switching, drain affected executions before credential changes and reject stale responses. A cancelled login must release listeners, stdin and its process. Success requires verification. No separate managed OAuth/token broker is introduced in v1.

Native continuation references bind driver, profile, instance and candidate; account changes do not reuse another account's session. Distinguish an unsuccessful turn from a permanently unusable session.

## Routing and state

Use explicit host eligibility, cost and retry policy. Queue limits apply per runtime; do not introduce a global cross-application daemon. Quota pauses and circuits have bounded state, expiry and injectable persistence. Retries are bounded, transient and explicitly repeatable; writes require host opt-in. Cancellation and persistence failures never trigger fallback. Keep immutable per-call context separate from bounded runtime-owned shared state.
