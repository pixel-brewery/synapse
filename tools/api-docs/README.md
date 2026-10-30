# Public API generation

Run `yarn nx run api-docs:generate --parallel=1` to update the reference, `api-docs:check` to compare it without writing, and `api-docs:test` for the adjacent generator regressions. The targets build package dependencies first. They neither import provider implementations nor execute or authenticate CLIs.

The generator discovers each literal public import path from package exports and resolves its source through the real TypeScript configuration. TypeScript export coverage, TypeDoc public-member documentation, unresolved references and all configured validation warnings remain fatal. An excluded public export also fails coverage.

Each import path keeps its own Markdown and reflection JSON. Discovery uses the public Markdown `MemberRouter` to register only actual public, addressable symbols. Cross-package type references resolve by package, normalized source path and qualified symbol identity. Explicit package-qualified TSDoc links resolve by their public import path. This preserves different same-named declarations under separate subpaths. Re-exports of the same source symbol use the root entry point as their canonical cross-reference when available.

During conversion, internal link tokens let TypeDoc validate resolved external references. After rendering, the generator replaces only link destinations with paths relative to the containing Markdown file. Reflection JSON `externalUrl` and external comment `target` values use paths relative to `.docs/`, as declared by `linkBase` in `.docs/api/api-index.json`; ordinary TypeDoc reflection IDs still refer to their own serialized project. No internal tokens, timestamps or machine-specific generation paths remain in artifacts. Generated Markdown links must reference emitted files.

TypeDoc's Markdown router deliberately leaves deeply nested anonymous object and union members without individual URLs. Their complete comments stay in the reflection JSON. The generator also renders those comments through the public Markdown theme context in their containing API page under “Nested type members”, so intersection/union fields retain their documentation without inventing public exports or router URLs.

Only `.docs/api/` and `.docs/packages/*/api/` are generated owners. Authored guides are preserved; output symlinks are rejected. Check mode compares staged bytes and leaves stale files untouched.
