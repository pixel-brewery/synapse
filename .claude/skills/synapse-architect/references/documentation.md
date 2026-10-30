# TSDoc and generated API documentation

The complete public API must be documented in English and generate a reusable API reference. This is part of implementation, not a later optional cleanup. Derived from Archipel's TSDoc guide and its actual documentation tooling.

## Required public documentation

Every exported declaration and every public/protected member describes purpose and consumer usage, parameters/properties, return values and errors. Interfaces, abstract methods, overloads, union variants, options, events, error fields and lifecycle methods are API too.

Use a useful summary and supported TSDoc tags. Document defaults, required/optional values, ownership, side effects, bounds, cancellation, session/profile binding, retry guarantees and disposal where relevant. Add minimal runnable `@example` blocks for non-obvious integration. `@internal` symbols stay out of public barrels/output. Do not export implementation helpers merely to make docs generation convenient.

Document actual semantics rather than restating a symbol name or type. Public behavior inherited with `@inheritDoc` must resolve to a real documented symbol. Reference public API with resolvable links; no absolute developer paths.

## Documentation owners

- `libs/synapse-*/README.md`: shipped package overview, imports, required/optional integration and minimal usage.
- `.docs/guides/`: authored integration, CLI compatibility and migration guidance.
- `.docs/guides/mcp.md`: optional developer MCP setup, all 15 tool contracts and registry/local archive distribution guidance.
- `.docs/patterns/`: nine authored Synapse pattern documents exposed through Archipel-compatible tool names/input shapes; examples stay framework-neutral and use actual Synapse contracts.
- `.docs/architecture/`: authored boundaries and reference decisions.
- `.docs/packages/<package>/api/`: generated API Markdown; never edit by hand.
- `.docs/api/`: generated machine-readable API reflection/index for embedding, produced by the same API owner.
- `tools/mcp/README.md`: shipped CLI overview and local archive usage; `tools/mcp/dist/data/corpus.json`: generated independently shipped knowledge, never edited by hand.

The configured TypeDoc pipeline owns generation. Consume public entry points and declaration comments, not a manually maintained symbol list. Keep package exports and docs entry points aligned. Validate undocumented public APIs, broken links and generation warnings through the actual targets. A successful build is not proof of complete API documentation.

## Integration and stability

Keep generated Markdown and JSON independent of a mandatory UI framework, so a future site or documentation tool can embed them. The approved optional `tools/mcp` CLI exposes the existing corpus through the official MCP SDK over stdio; it does not introduce a frontend, HTTP service, provider execution or authentication. It follows Archipel's 15 documentation/guide/pattern tool contracts with Synapse semantics, not NestJS/Prisma scaffolds.

The nine runtime-library exports remain the TypeDoc API surface. The MCP CLI has no public TypeScript entrypoint; document its protocol through the actual tool schemas, guide and CLI README. Its build checks API drift, then consumes generated API Markdown recursively, the API index, package documentation, guides and patterns into a portable corpus. State API stability and migration expectations, update README/guides when contracts change and regenerate through `yarn nx` targets. Publication remains an explicit owner action.
