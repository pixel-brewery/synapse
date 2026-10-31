---
name: synapse-architect
description: 'Design, implement, refactor, test, document and review Synapse CLI AI libraries. Apply the versioned Architecture foundations with Synapse package, abstraction, source, TSDoc, lifecycle and generated API documentation rules.'
metadata:
  inherits: architecture
---

# Synapse Architect

Mandatory for every Synapse task, including subagents and automations. This is the project-specific architecture, source, test and documentation rule set for Synapse, derived from the shared Architecture base. Read the base and local project contract first; route into every applicable foundation below. Do not substitute Symphony, NestJS or another project's architecture skill.

## Inherited architecture foundation

This project skill derives from the versioned [Architecture base](../architecture/SKILL.md) installed from `pixel-brewery/skills`. Read that skill and its [shared workflow](../architecture/references/common/workflow.md) first, together with root `AGENTS.md` and the [local project contract](references/project.md), for every task, including delegated work.

Apply the base's task classification, owner/reference pass, subagent coordination and completion gates. Select every applicable foundation below and combine it with the local project references; do not load unrelated modules. Local rules specialize the shared principles for this project's actual owners and frameworks. A local framework translation does not waive a general architecture invariant or expand the authorized scope.

`skills-lock.json` records the immutable upstream commit and content hash. Do not edit the installed `architecture` skill, copy common modules back into this skill, or substitute another project's architect. Restore the pinned dependency if it is missing. Validate skill updates with `python3 .agents/skills/architecture/scripts/check_inheritance.py --root . --derived synapse-architect` and the repository's configured client checks.

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
| Every task | [Workflow](../architecture/references/common/workflow.md) | [Project and layout](references/project.md), [Environment](references/environment.md) |
| Architecture, package dependencies, extraction or migration | [Architecture](../architecture/references/common/architecture.md) | [Architecture](references/architecture.md) |
| TypeScript, filenames, abstractions and composition | [OOP and SOLID](../architecture/references/common/oop.md) | [Source conventions](references/source.md), [Contracts](references/contracts.md) |
| Drivers, profiles, auth, processes, sessions and disposal | [Platform](../architecture/references/common/platform.md), [Integration integrity](../architecture/references/common/backend-safety.md) | [Runtime and providers](references/platform.md) |
| Validation, serialization and generated types | [Backend contracts](../architecture/references/common/backend-contracts.md) | [Contracts](references/contracts.md) |
| Tests, fixtures, regression and contract evidence | [Testing](../architecture/references/common/testing.md), plus the production foundation | [Testing](references/testing.md) |
| TSDoc, public API, docs generation and embedding | [OOP documentation](../architecture/references/common/oop.md) | [API documentation](references/documentation.md), [Tooling](references/tooling.md) |
| Nx generation, linking, ESM packaging and AI client setup | Production foundation | [Tooling](references/tooling.md) |
| Deadlines, expiry, quota windows and persisted timestamps | [Time semantics](../architecture/references/common/date-time.md) | [Runtime](references/platform.md), [Contracts](references/contracts.md) |
| Consumer frontend/API/infrastructure questions | [Frontend](../architecture/references/common/frontend.md), [Frontend patterns](../architecture/references/common/frontend-patterns.md), [Backend](../architecture/references/common/backend.md), [API URLs](../architecture/references/common/api.md), [Browser E2E](../architecture/references/common/e2e.md), only as applicable | Keep product implementation in its owning consumer; Synapse does not acquire a frontend, HTTP API or database through these references. |

All shared foundation modules come from the pinned Architecture base. [Origin and adaptations](references/origin.md) records the source and deliberate project translations. Client adapters and generated skill mirrors are projections of this canonical tree.
