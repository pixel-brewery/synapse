# Synapse project contract

Read for every task with root `AGENTS.md` and [shared workflow](common/workflow.md). This contract applies Archipel's full general foundations to Synapse. It takes precedence over NestJS, application database, frontend and transport examples in shared modules.

## Scope and layout

Synapse publishes reusable Node.js 24+ ESM packages as `@pixel-brewery/synapse-*`. macOS, Linux and native Windows are supported targets. Host applications compose providers explicitly. Do not add a mandatory Effect, NestJS, Electron, Angular, cloud runtime or API-key dependency.

- `libs/synapse-core/`: Node-free and provider-free intent, values, abstract seams, errors and events.
- `libs/synapse-runtime/`: process execution, environment construction, bounded streams, deadlines, cancellation, workspace ownership and disposal; no concrete driver imports.
- `libs/synapse-auth/`: isolated application/account profiles and the shared authentication lifecycle, using runtime primitives.
- `libs/synapse-routing/`: provider-neutral scheduling, strategies, quotas, circuit state and injected storage contracts.
- `libs/synapse-provider-{codex,claude,opencode,acp}/`: concrete CLI/protocol drivers, actual auth methods, protocol normalization and provider metadata. Provider dependencies stay here.
- `libs/synapse-testing/`: simulated providers, process fixtures and replay helpers; no concrete provider dependencies.
- `apps/`: thin executable consumers. The meeting-notes text example must run without Symphony, Electron or Git.
- `tools/mcp/`: optional `@pixel-brewery/synapse-mcp` documentation CLI, using the official MCP SDK over stdio and its independently bundled local corpus. No provider execution or authentication; no dependency from the nine runtime libraries.
- `tools/`: repository tooling and artifact verification; `.docs/`: authored guides and generated package API documentation.
- `.agents/skills/synapse-architect/`: all architecture foundations and local interpretation; `.vscode/mcp.json`: canonical MCP registry.

Every library owns `package.json`, resolved Nx targets, TypeScript configs, package README and `src/index.ts`. Public declarations live directly under appropriate `src/` owner directories, with `interfaces/`, `abstracts/`, `errors/`, `models/`, `services/` and `adapters/` as needed. Create only useful directories. Do not retain generator `src/lib/` buckets or kebab-case declaration files.

The optional MCP workspace is CLI-only: `synapse-mcp` runs `dist/main.js`, exports only `./package.json`, and has no public TypeScript entrypoint. It shares fixed versioning with the nine runtime libraries while remaining a separate developer tool. Its corpus comes from existing package/API documentation, guides and nine `.docs/patterns/` documents; do not add a second API inventory or a mandatory documentation website.

Read [source](source.md) before TypeScript changes, [architecture](architecture.md) for boundaries, [documentation](documentation.md) for public API, and [tooling](tooling.md) for generation/exports.

## Evidence and authority

Executable owners are root/package manifests, `.yarnrc.yml`, `nx.json`, TypeScript/ESLint/Vitest configs and `yarn nx show project <name> --json`. Use configured versions. Never work around workspace dependency resolution with source aliases.

Host applications own prompts, approvals, target-project worktrees, UI, model catalog policy, durable databases and business results. Preserve Symphony's existing login paths and native sessions through explicit mappings. Never copy consumer entities into core.

The approved implementation authorizes the separate Synapse repository and an isolated Symphony integration worktree. Preserve ordinary user checkouts. Ordinary skill use grants no new branch, worktree, release or external-write authority.

Before completion, review the combined diff for duplicate owners, lifecycle bypasses, dependency direction, public exports, source rules and stale documentation. Run focused checks and the gates actually required by the task; report commands and real results.
