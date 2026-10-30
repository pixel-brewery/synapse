# Architect origin and project translations

The shared foundations and common workflow block originate from `archipel-architect` in [Pixel Brewery Archipel](https://github.com/RueDeRennes/archipel), inspected on 2026-10-29. `.agents/architect-origin.json` records the inspected commit and content hashes. The origin check detects modifications to retained shared skill content independently of the commit ID.

All 13 shared modules are retained, including OOP/SOLID, architecture, workflow/delegation, platform, integration safety, contracts, API conventions, time semantics, testing and frontend/browser foundations. No general foundation was dropped. They are unchanged copies; local references define their Synapse application.

These hashes establish shared-skill equality only. They do not verify root scripts, installed tools, hooks, CI or package/release behavior. Apply the [repository workflow comparison](tooling.md#repository-workflow-parity) when assessing the wider Archipel setup.

Archipel's current skill takes precedence over its older instructions where they disagree about tooling, dependency inventories, coverage, blanket tests, whole-file rewrites or upgrades. Synapse follows the current skill interpretation and actual executable configuration.

Deliberate translations:

- `libs/platform-*` becomes `libs/synapse-*`; the generic library source structure and naming remain.
- Nest DI tokens and modules become documented abstract bases and explicit constructor composition. No Nest runtime dependency.
- Archipel ConfigService/mapping/repositories describe ownership principles; Synapse uses host-supplied typed options, neutral results and injected storage abstractions.
- Provider packages stay independently selectable instead of a shared framework/provider umbrella. ESM packaging adds actual tarball, inert-import and dual-bundler checks from the approved Synapse plan.
- Product UI, billing, HTTP authorization and relational database machinery stay with consumers. Local stdio/profile isolation is Synapse's boundary.
- TSDoc and TypeDoc API generation remain mandatory, with embeddable Markdown/JSON outputs and no mandatory documentation frontend.
- Shared-machine serial verification does not restrict application runtime concurrency.

Keep changes in Synapse's local references unless an upstream foundation change is deliberately coordinated. A future source update must inspect the recorded hashes and preserve the explicit framework-neutral interpretation.
