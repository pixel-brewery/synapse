# Architect origin and project translations

The shared foundations now come from the [Architecture base](../../architecture/SKILL.md) in [Pixel Brewery Skills](https://github.com/pixel-brewery/skills). The standard root `skills-lock.json` pins its exact commit, path and content hash. `yarn agents:upstream` validates that installed dependency and this skill's explicit derivation; it does not authorize changing the dependency or fetching a floating branch.

The original extraction came from `archipel-architect` in [Pixel Brewery Archipel](https://github.com/RueDeRennes/archipel), inspected on 2026-10-29 at commit `de447fe50270be028da87eb774dd94448820c786`. `.agents/architect-origin.json` preserves that historical extraction record. Its former hashes do not describe the current versioned dependency and are no longer the active integrity check.

All 13 shared domains remain available from the base, including OOP/SOLID, architecture, workflow/delegation, platform, integration safety, contracts, API conventions, time semantics, testing and frontend/browser foundations. Local references retain their Synapse-specific application. Skill integrity checks do not verify root scripts, installed tools, hooks, CI or package/release behavior; apply the [repository workflow comparison](tooling.md#repository-workflow-parity) when assessing that wider setup.

The pinned Architecture base and maintained Synapse project references take precedence over older instruction examples where they disagree about tooling, dependency inventories, coverage, blanket tests, whole-file rewrites or upgrades. Follow the current skill interpretation and actual executable configuration.

Deliberate translations:

- `libs/platform-*` becomes `libs/synapse-*`; the generic library source structure and naming remain.
- Nest DI tokens and modules become documented abstract bases and explicit constructor composition. No Nest runtime dependency.
- Archipel ConfigService/mapping/repositories describe ownership principles; Synapse uses host-supplied typed options, neutral results and injected storage abstractions.
- Provider packages stay independently selectable instead of a shared framework/provider umbrella. ESM packaging adds actual tarball, inert-import and dual-bundler checks from the approved Synapse plan.
- Product UI, billing, HTTP authorization and relational database machinery stay with consumers. Local stdio/profile isolation is Synapse's boundary.
- TSDoc and TypeDoc API generation remain mandatory, with embeddable Markdown/JSON outputs and no mandatory documentation frontend.
- Shared-machine serial verification does not restrict application runtime concurrency.

Keep project changes in Synapse's local references. A reviewed upstream update must preserve the explicit framework-neutral interpretation and pass the lock, inheritance and generated-client checks.
