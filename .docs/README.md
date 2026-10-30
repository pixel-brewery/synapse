# Synapse documentation

Synapse connects local Node.js applications to installed AI CLIs through explicitly composed packages. Applications keep their own prompts, workflows, approvals and result storage.

The MIT-licensed source is being prepared for public hosting at [pixel-brewery/synapse](https://github.com/pixel-brewery/synapse). Repository transfer and public visibility follow the owner's [public source launch](guides/releases.md#public-source-launch). The initial family version is `0.0.1`; all ten packages target public GitHub Packages under `@pixel-brewery`. Install published versions after registry/version/visibility verification, using the required registry authentication. The MCP package carries its documentation independently of repository access.

## Start here

| Goal                                                                 | Read                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| Understand the motivation and the application boundary               | [Why Synapse exists](guides/why-synapse.md)             |
| Integrate runtime, profiles, authentication and persisted sessions   | [Consumer guide](guides/consumers.md)                   |
| Compare application ownership, execution and orchestration choices   | [Library comparison](guides/comparison.md)              |
| Check CLI versions, native capabilities and actual platform evidence | [CLI compatibility](guides/cli-compatibility.md)        |
| Run an independent text example with explicit simulation             | [Meeting-text example](../apps/meeting-notes/README.md) |
| Test a dedicated native CLI account, resume and cancellation         | [Native verification](guides/native-verification.md)    |
| Understand package boundaries and lifecycle decisions                | [Architecture](architecture/synapse.md)                 |
| Understand streaming, cancellation and the RxJS decision             | [Native streaming](architecture/streaming.md)           |
| Generate or embed the public API reference                           | [API documentation](guides/api-documentation.md)        |
| Give a coding agent local package, API, guide and pattern knowledge  | [Optional MCP server](guides/mcp.md)                    |
| Contribute a change or report a reproducible bug                     | [Contributing](../CONTRIBUTING.md)                      |
| Report sensitive security findings                                   | [Security policy](../SECURITY.md)                       |
| Prepare a coordinated version and assess release evidence            | [Release guide](guides/releases.md)                     |

## Packages and API reference

Package READMEs explain imports and integration. Generated references describe the actual exported contracts and members.

| Package                                    | Overview                                                             | API                                                          |
| ------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `@pixel-brewery/synapse-core`              | [Contracts and errors](../libs/synapse-core/README.md)               | [Reference](packages/synapse-core/api/index.md)              |
| `@pixel-brewery/synapse-runtime`           | [Execution and cleanup](../libs/synapse-runtime/README.md)           | [Reference](packages/synapse-runtime/api/index.md)           |
| `@pixel-brewery/synapse-auth`              | [Profiles and native authentication](../libs/synapse-auth/README.md) | [Reference](packages/synapse-auth/api/index.md)              |
| `@pixel-brewery/synapse-routing`           | [Selection and admission](../libs/synapse-routing/README.md)         | [Reference](packages/synapse-routing/api/index.md)           |
| `@pixel-brewery/synapse-provider-codex`    | [Codex](../libs/synapse-provider-codex/README.md)                    | [Reference](packages/synapse-provider-codex/api/index.md)    |
| `@pixel-brewery/synapse-provider-claude`   | [Claude Code](../libs/synapse-provider-claude/README.md)             | [Reference](packages/synapse-provider-claude/api/index.md)   |
| `@pixel-brewery/synapse-provider-opencode` | [OpenCode](../libs/synapse-provider-opencode/README.md)              | [Reference](packages/synapse-provider-opencode/api/index.md) |
| `@pixel-brewery/synapse-provider-acp`      | [ACP stdio](../libs/synapse-provider-acp/README.md)                  | [Reference](packages/synapse-provider-acp/api/index.md)      |
| `@pixel-brewery/synapse-testing`           | [Simulations and replays](../libs/synapse-testing/README.md)         | [Reference](packages/synapse-testing/api/index.md)           |

The [machine-readable API index](api/api-index.json) links each public import path to its Markdown and reflection JSON. Generated files come from exported source declarations and TSDoc; edit those sources and run `yarn docs` instead of editing generated pages.

## Optional developer MCP tool

[`@pixel-brewery/synapse-mcp`](../tools/mcp/README.md) is a separate stdio CLI for coding-agent documentation access. Its bundled corpus includes all nine libraries, generated API pages recursively, authored guides and nine Synapse patterns. Its 15 tools share Archipel's input shapes while describing Synapse's framework-neutral architecture. It neither imports the runtime providers nor performs native authentication or execution.

The [MCP guide](guides/mcp.md) documents build/start, local archive installation and client configuration. This CLI has no public TypeScript import surface, so the nine-library API table and index remain unchanged. The fixed release group contains those nine libraries plus this optional tool, initially versioned together at `0.0.1`.

Public source hosting and public GitHub Packages publication have separate owner checks. For launch and installation/publication status, actual platform evidence and explicitly invoked live-CLI checks, use the [release guide](guides/releases.md). A configured CI matrix and simulated example do not establish live-provider compatibility.
