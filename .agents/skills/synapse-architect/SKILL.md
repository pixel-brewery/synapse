---
name: synapse-architect
description: 'Design, implement, refactor, test, document and review Synapse CLI AI libraries. Apply the complete shared Archipel architecture foundations with Synapse package, abstraction, source, TSDoc, lifecycle and generated API documentation rules.'
---

# Synapse Architect

Mandatory for every Synapse task, including subagents and automations. This is the sole architecture, source, test and documentation rule set for Synapse. Read the shared workflow and local project contract first; route into every applicable foundation below. Do not substitute Symphony, NestJS or another project's architecture skill.

<!-- architect-core:start -->

## Select and apply the relevant guidance

1. Read `AGENTS.md`, [shared workflow](references/common/workflow.md) and [local project contract](references/project.md) at task start, whether or not this skill was mentioned.
2. Identify the requested action and actual production owners. A test task is classified by both its test kind and the code it exercises.
3. Own task decomposition, maximum useful subagent parallelism and result integration for every task. Follow [parallel subagent coordination](references/common/workflow.md#parallel-subagent-coordination); use the active Claude Code or ChatGPT/Codex client's native subagents without waiting for another delegation request.
4. Select all applicable domain rows below; combine domain and testing guidance. Read the common module and its project reference before editing. Do not load every reference by default.
5. Complete the canonical-owner/reference pass before implementation; inspect installed platform capabilities and actual consumers/generators. Keep the reference map in task context.
6. Revisit routing and work allocation when another boundary is reached. Specific project rules govern their actual owners; executable configuration resolves stale paths, versions, runners and generation assumptions.
7. Complete the task-scoped drift/duplication pass, focused verification and local documentation/consequence gates. Preserve the requested mode and output format; ordinary implementation does not imply a full architecture report, scoring rubric, Definition of Done, legal review or release.

The common modules and this workflow are synchronized across the Archipel, Mosaik and FLAMOX365 architect skills. Each skill works independently from its own checkout. Keep project-specific paths, policies and compatibility choices in the local references; compare shared changes with `.agents/scripts/sync_architect_core.py --peer <other-checkout> --check` for each peer.
<!-- architect-core:end -->

## Synapse applicability and precedence

User instructions and the approved scope govern the task. Within this skill, the Synapse references apply the shared foundations to the actual project and take precedence over framework-specific examples in common modules. Executable configuration resolves stale tooling examples; it does not silently waive a structural rule.

- Synapse is framework-neutral. Abstract bases remain explicit runtime substitution seams; constructor injection and explicit factories replace Nest DI tokens, decorators and module registration. Do not add NestJS, an HTTP server, Prisma or Archipel runtime dependencies.
- Configuration is supplied by the host through typed options. Environment capture belongs to the runtime bootstrap owner. Archipel ConfigService, MappingService and execute(query) examples are conceptual precedents, not dependencies to import.
- Host applications own business authorization, billing, UI, workflows, durable databases and model catalog policy. Apply the relevant isolation and failure foundations at Synapse's CLI/profile boundary.
- Subprocess and ACP stdio are local transports. The common public-HTTPS rules apply only to an actual HTTP feature; they do not prohibit supported native login callbacks or stdio.
- Preserve all general foundations: ownership, SOLID, abstract bases/adapters, typed contracts, meaningful tests, resource bounds, lifecycle, TSDoc, export boundaries and migration integrity.

## Select the relevant foundations

| Boundary | Shared foundation | Synapse application |
| --- | --- | --- |
| Every task | [Workflow](references/common/workflow.md) | [Project and layout](references/project.md), [Environment](references/environment.md) |
| Architecture, package dependencies, extraction or migration | [Architecture](references/common/architecture.md) | [Architecture](references/architecture.md) |
| TypeScript, filenames, abstractions and composition | [OOP and SOLID](references/common/oop.md) | [Source conventions](references/source.md), [Contracts](references/contracts.md) |
| Drivers, profiles, auth, processes, sessions and disposal | [Platform](references/common/platform.md), [Integration integrity](references/common/backend-safety.md) | [Runtime and providers](references/platform.md) |
| Validation, serialization and generated types | [Backend contracts](references/common/backend-contracts.md) | [Contracts](references/contracts.md) |
| Tests, fixtures, regression and contract evidence | [Testing](references/common/testing.md), plus the production foundation | [Testing](references/testing.md) |
| TSDoc, public API, docs generation and embedding | [OOP documentation](references/common/oop.md) | [API documentation](references/documentation.md), [Tooling](references/tooling.md) |
| Nx generation, linking, ESM packaging and AI client setup | Production foundation | [Tooling](references/tooling.md) |
| Deadlines, expiry, quota windows and persisted timestamps | [Time semantics](references/common/date-time.md) | [Runtime](references/platform.md), [Contracts](references/contracts.md) |
| Consumer frontend/API/infrastructure questions | [Frontend](references/common/frontend.md), [Frontend patterns](references/common/frontend-patterns.md), [Backend](references/common/backend.md), [API URLs](references/common/api.md), [Browser E2E](references/common/e2e.md), only as applicable | Keep product implementation in its owning consumer; Synapse does not acquire a frontend, HTTP API or database through these references. |

All common foundation modules are retained from Archipel. [Origin and adaptations](references/origin.md) records the source and deliberate project translations. Client adapters and generated skill mirrors are projections of this canonical tree.
