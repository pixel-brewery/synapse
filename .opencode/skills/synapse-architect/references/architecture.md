# Synapse architecture and abstractions

Use with common Architecture and OOP. Apply [project](project.md), [source](source.md) and [platform](platform.md).

## Abstract bases and adapters

Use abstract classes for replaceable behavior with runtime significance: drivers, subprocess execution, injected persistence and routing strategies where real variation exists. Their names end in `Base`; files live in `src/abstracts/`. Concrete adapters extend the appropriate base and receive dependencies through constructors. No `*Port` classes or `ports/` directories. Pure type-only contracts remain `I`-prefixed interfaces under `interfaces/`.

Synapse uses explicit construction and factories instead of Nest decorators/modules/DI tokens. Do not build a framework container. Favor composition, segregated capabilities and shallow inheritance. Simple stateless transformations may be functions; a class exists for a clear responsibility, state, lifecycle or replacement seam.

Distinguish driver implementation, configured instance and application/account profile. IDs are open strings/typed identifiers, never a closed central provider enum. New drivers register without editing core or runtime. Mutable account/session state is never shared between instances.

## Dependency direction

Core has no Node.js, external provider or framework dependency. Runtime depends on neutral contracts only. Auth uses runtime; routing uses neutral execution contracts and injected storage. Concrete drivers depend on the needed lower-layer packages, never on one another. Testing does not register/import real providers. Consumers explicitly select packages.

Enforce package boundaries with actual imports and manifests. No all-provider registry, convenience root that imports concrete adapters, source aliases hiding undeclared dependencies or provider SDK types in neutral APIs.

## Optional developer knowledge server

`tools/mcp` is a separately shipped documentation CLI beside the nine runtime libraries. It depends on the official MCP SDK and serves a bounded bundled corpus over stdio; runtime libraries neither depend on it nor acquire an MCP/HTTP service through it. It is not an execution adapter, provider gateway, account inspector or authentication owner.

Package/API docs, guides and nine Synapse patterns remain the canonical knowledge sources. TypeDoc owns the API inventory; the MCP build checks drift and recursively consumes that output into `dist/data/corpus.json`. The 15 Archipel-compatible tool names/input shapes describe Synapse abstractions and explicit composition. Do not generate NestJS modules, Prisma repositories or product workflows from inherited pattern labels. No public TypeScript library entrypoint is added for this CLI.

## Public execution contract

One run creates one execution with a bounded event stream and one result. Result completion must work even if no one consumes events. Define overflow behavior rather than hanging or growing memory. Text and structured results share lifecycle; runtime schema validation must check the actual output. Unsupported declared safety/execution capabilities fail before launch. ACP capabilities and native modes learned during initialization are checked before submitting any prompt.

Native sessions bind driver, instance/profile and candidate. Cross-provider fallback receives only explicitly supplied context. Never pass a foreign native session ID. Host business policy supplies eligible candidates and controls repeatability; writes require explicit retry permission. Abort and host/persistence failures never retry a provider.

Validate deterministic configuration/duplicate IDs early, retain failures as typed errors and preserve old state through explicit migration/coexistence mappings. A new abstraction is justified by real variation or lifecycle, never by speculative universality.
