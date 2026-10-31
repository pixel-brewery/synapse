# Nx, packages, generated documentation and AI configuration

Use configured Yarn/Nx versions and resolve project names and targets using `yarn nx show projects` / `yarn nx show project <name> --json`. Use installed schemas/help for unfamiliar options; never guess flags.

## Repository workflow parity

When adopting or checking Archipel's project setup, compare the executable repository workflows as well as the shared architect skill:

- Root scripts and their backing capabilities: resolve the actual Yarn/Nx commands, installed tools and target owners, including dependency updates and contributor setup.
- Quality gates: compare formatting, lint, spelling, types, tests, documentation and package verification, including their invocation from `verify` and CI.
- Local hooks and repository configuration: inspect hook installation, staged-file checks, commit conventions, ownership and dependency-update configuration.
- CI and package/release workflows: trace the actual project selection, platform coverage, build outputs, package exports and publication prerequisites. Preserve the owner's selected main-branch release workflow and authorization boundaries.
- Intentional translations: apply Synapse's framework-neutral scope, serial machine checks and independent documentation artifacts. Explain relevant differences in existing project guidance or the task response; no separate parity report is required.

An absent command needs an explicit applicability decision. Do not declare complete repository parity from matching skill hashes or from a script name whose backing behavior has not been checked.

## Generation and dependency linking

Before scaffolding, discover the suitable installed/local Nx generator, inspect its help, schema and implementation, compare actual sibling owners, dry-run the exact directory, inspect placement, then generate noninteractively. Adapt generated code immediately to `libs/synapse-*` and the source rules; do not leave placeholder exports or empty suites.

Add actual package dependencies with Yarn workspace commands, e.g. `yarn workspace @pixel-brewery/synapse-auth add @pixel-brewery/synapse-runtime@workspace:^`. Do not hand-edit dependency links or add TypeScript source aliases to hide missing dependencies. Keep installs/generation serial.

## Packaging

Native ESM with per-file `.js` and `.d.ts`, explicit package exports and `sideEffects: false` backed by import/bundle evidence. No global registration or all-provider barrel. Provider SDK/protocol dependencies remain in their provider package. No import-time file searches, process starts, network calls, timers, login or global listeners.

Package family versioning is coordinated through the fixed Nx release group. Pack/build from each manifest's real output; validate exported targets and declarations from tarballs without workspace aliases. esbuild and Rollup single-provider consumers must exclude other provider implementations. Local artifact preparation does not publish or trigger releases. Owner-authorized publication uses the main-branch workflow or the separate `:local` release commands documented in `.docs/guides/releases.md`, GitHub Packages and an explicit prepared release tag. Preserve the existing remote commands when changing the local path. Nx replaces local dependency protocols with publishable version ranges because its Yarn-backed publisher cannot publish `workspace:` dependencies.

The fixed release group contains nine runtime libraries and the optional `synapse-mcp` CLI. `tools/mcp` ships `dist/main.js` as the `synapse-mcp` bin and only exports `./package.json`; it has no library entrypoint to add to TypeDoc or all-provider imports. The official MCP SDK dependency stays in this developer workspace. CLI startup is an explicit host action, not an import-time library effect.

## Documentation

Use the TypeDoc-based pipeline identified in [documentation](documentation.md). Public entry points, README/TSDoc and authored guides are sources; API Markdown/JSON are generated outputs. Resolve actual generator options and installed plugins. No second manual API inventory or unrequested documentation site.

`yarn nx run synapse-mcp:build` depends on `api-docs:check`, compiles the stdio CLI and assembles `tools/mcp/dist/data/corpus.json`. After changing source API documentation, run `yarn docs` explicitly first; the MCP build must not silently regenerate and conceal documentation drift. The builder recursively includes API Markdown and consumes the existing API index, package metadata/READMEs, guides, architecture documents and nine Synapse pattern documents. Built corpus files are generated assets, never hand-maintained sources. Start locally with `yarn workspace @pixel-brewery/synapse-mcp start`; registry execution requires a published version and authenticated GitHub Packages configuration.

## AI provider setup

`.agents/skills/synapse-architect/` is the canonical project specialization; `.agents/skills/architecture/` is its installed, versioned base. `AGENTS.md` mandates it for every task. `CODEX.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, OpenCode instructions and generated skill mirrors only route to that owner.

`.vscode/mcp.json` owns shared MCP servers. `yarn agents:sync` generates Codex, Claude and OpenCode projections without invoking a provider, logging in, installing global tools or changing personal credentials/settings. `yarn agents:check` verifies mirror equality, references, adapters and configuration drift. Never edit generated projections or symlink a mirror to its canonical source.

The canonical `synapse` server uses `yarn workspace @pixel-brewery/synapse-mcp start` from the Synapse workspace root after a local build. The documentation server serves only its packaged knowledge over stdio. It does not use Synapse auth/profile state, run AI providers, expose HTTP or request privileged accounts. Consumer examples use a user-filled absolute built entrypoint or the correct project working directory; never commit real developer paths or advertise unpublished packages as installable from a registry.

Keep the installed Architecture base intact. The standard `skills-lock.json` records `pixel-brewery/skills`, its immutable commit ref, skill path and content hash. Adapt only Synapse references and inspect the combined result when updating the base.

## Shared foundation maintenance

`yarn agents:upstream` validates the installed base against `skills-lock.json` and verifies Synapse's explicit inheritance through the base's `scripts/check_inheritance.py`. It does not fetch a floating branch, change the lock or require a peer checkout. Update with the Skills CLI using an explicitly reviewed full commit in the GitHub tree URL and the `architecture` skill; run `yarn agents:sync` and `yarn agents:check` afterward. Never edit imported base files or restore a separately maintained local `references/common/` copy. `.agents/architect-origin.json` remains historical evidence for the original Archipel extraction, not the current dependency lock.
