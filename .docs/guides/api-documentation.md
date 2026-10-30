# API documentation

Synapse generates its public API reference from exported TypeScript declarations and English TSDoc. The tools are **TypeDoc 0.28.20** and **typedoc-plugin-markdown 4.14.1**, the same tool family used by Archipel. They are development dependencies; consumers do not install them through runtime packages.

```sh
yarn docs
yarn docs:check
yarn nx run api-docs:test
```

Generation discovers each public library and every explicit package export from its manifest and TypeScript output configuration. Nx builds library dependencies first, so cross-package imports resolve through real package exports and declarations. Each public import path is processed separately so two subpaths may expose identically named symbols without collisions. Missing source entry points, type errors, undocumented public/protected API, unresolved links, warnings and exports absent from the reflection model fail generation.

The source convention check also requires contractual TSDoc: useful summaries and appropriate parameter, return, error and lifecycle documentation. TypeDoc's missing-comment check alone cannot establish that a comment explains the complete behavior.

Generated artifacts:

- `.docs/packages/<library>/api/`: portable Markdown with relative `.md` links. Additional exports live beneath `subpaths/`.
- `.docs/api/<library>/reflection.json`: full TypeDoc reflection data. Additional exports use matching `subpaths/` directories.
- `.docs/api/api-index.json`: versioned index of packages, import paths, exported names and linkable API symbols.

The artifacts contain no generation timestamp, machine path or Git revision. They can be embedded in a documentation site, search index or documentation service without requiring VitePress, Electron or a particular frontend framework. Index links are relative to `.docs/`; reflection paths are relative to that same root.

`yarn docs:check` generates into a temporary owned directory and compares bytes against the checked-in generated artifacts. It does not rewrite documentation. `yarn docs` replaces only generated `api/` directories and `.docs/api/`; authored guides and package overview pages are preserved. Do not edit generated files manually.

Public symbols require TSDoc on their declarations and public/protected members. Explain intent, required and optional inputs, defaults, returned values, meaningful errors, ownership, cancellation and disposal. Use `@example` when integration is not obvious, and keep `@internal` implementation details out of public exports. The reference follows implemented exports; a package's presence alone does not establish a capability.

Tool references: [TypeDoc](https://typedoc.org/), [Markdown plugin](https://typedoc-plugin-markdown.org/). The pipeline follows Archipel's source-generated reference approach and additionally checks actual validation results, export coverage and deterministic output.

Regenerate the API index after coordinated version preparation; [release preparation](releases.md) documents the local preview, verification and explicit publication sequence.
