# @pixel-brewery/synapse-mcp

Local development knowledge for AI coding agents: Synapse package documentation, full generated API references, integration/architecture guides and nine architecture patterns through 15 MCP tools.

This optional CLI uses the official `@modelcontextprotocol/sdk` **1.32.1** over stdio. It ships its own corpus and has no public TypeScript import surface. The nine Synapse runtime libraries remain independent of this developer tool.

**Initial family version: `0.0.1`.** Install a published package from public GitHub Packages after registry verification. The MIT-licensed source is being prepared for public hosting at [pixel-brewery/synapse](https://github.com/pixel-brewery/synapse). Repository transfer and public visibility follow the owner's [public source launch](../../.docs/guides/releases.md#public-source-launch), independently of package publication.

## Start from a checkout

Use Node.js 24.15+ and the workspace's pinned Yarn. From the Synapse root:

```sh
yarn nx run synapse-mcp:build
yarn workspace @pixel-brewery/synapse-mcp start
```

The build checks TypeDoc for drift and includes its API pages recursively in `dist/data/corpus.json`. After changing exported API documentation, explicitly run `yarn docs` before building; the MCP build does not regenerate stale API pages. An MCP client starts the process and exchanges messages over stdin/stdout; a manually started server waits for those messages. Stdout is protocol-only, with diagnostics on stderr.

For a client with `command`/`args` stdio configuration, use `node` and replace this placeholder with the actual built entry point:

```json
{
    "command": "node",
    "args": ["/absolute/path/to/synapse/tools/mcp/dist/main.js"]
}
```

On Windows, use the actual absolute path with forward slashes, such as `C:/projects/synapse/tools/mcp/dist/main.js`. The bundled corpus resolves relative to the package, so this direct entry point works from another working directory. Ensure the client can locate Node.js 24.15+.

The [MCP guide](../../.docs/guides/mcp.md) contains complete Codex, Claude Code, OpenCode and VS Code examples plus every input contract. The guide is also part of the corpus and can be retrieved with `get-guide` using `{ "guideName": "mcp" }`.

## Tools

| Group                 | Names                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package documentation | `list-packages`, `get-package-doc`, `search-docs`                                                                                                                                                             |
| Integration guides    | `list-guides`, `get-guide`, `search-guides`                                                                                                                                                                   |
| Synapse patterns      | `get-query-pattern`, `get-repository-pattern`, `get-mapping-pattern`, `get-module-pattern`, `get-error-handling-pattern`, `get-config-pattern`, `get-guard-pattern`, `get-dto-pattern`, `get-testing-pattern` |

For example, call `get-package-doc` with `{ "packageName": "synapse-runtime" }` or `get-guide` with `{ "guideName": "consumers" }`. Tool names and input shapes follow Archipel's documentation server; the returned content describes Synapse's framework-neutral contracts, adapters and explicit composition. It generates no NestJS/Prisma scaffolds and writes no project files.

Inputs are strict and bounded; searches include nested API content. Unknown IDs and responses exceeding the eight-MiB text budget return explicit errors. Lists are JSON text, and full matching documents are returned without silent truncation. The guide documents all limits and optional contextual example inputs. The server loads one validated immutable corpus at startup, with no current-directory or checkout fallback.

This server only serves its packaged knowledge. It does not start provider processes, perform inference, authenticate, inspect accounts or mutate credentials. It requires no provider account or API key and opens no HTTP server. The MCP client controls the process lifecycle and how returned documentation is used.

## Registry installation and local archives

Configure the `@pixel-brewery` GitHub Packages scope and registry authentication using the [installation guide](../../.docs/guides/consumers.md#install-from-github-packages). Public GitHub npm packages still require registry authentication, independently of any native AI login. Install the verified published version:

```sh
yarn add -D @pixel-brewery/synapse-mcp@0.0.1
yarn exec synapse-mcp
```

For local evaluation, install a maintainer-provided built archive instead:

```sh
yarn add -D @pixel-brewery/synapse-mcp@file:./vendor/synapse-mcp-0.0.1.tgz
yarn exec synapse-mcp
```

Run that command from the consumer root when using its installed bin. Configure the MCP client's working directory accordingly. The archive contains documentation and API content; it needs no checkout or documentation website.

For npm/npx clients, configure the npm GitHub scope and authentication separately before using `npx @pixel-brewery/synapse-mcp@0.0.1` for a verified published version. The registry is GitHub Packages; public source access follows the owner's separate launch steps. See the [release guide](../../.docs/guides/releases.md).

## Documentation ownership

Package READMEs, exported source TSDoc, generated TypeDoc output, guides and Synapse patterns are the source corpus. Rebuild after updating them; never edit generated corpus files in `dist/`. Missing or invalid bundled data is a startup failure, not an invitation to search the user's filesystem for credentials or documentation.

See [LICENSE](LICENSE).
