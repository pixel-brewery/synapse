# Local Synapse knowledge over MCP

`@pixel-brewery/synapse-mcp` gives coding agents structured access to Synapse's package documentation, complete generated API, integration guides and architecture patterns. It is an optional developer CLI alongside the nine runtime libraries. Applications do not need it to execute an AI request.

The server uses `@modelcontextprotocol/sdk` **1.32.1** over **stdio**. Its 15 tool names and input shapes match Archipel's documentation server. Returned knowledge applies to Synapse: explicit constructor composition, CLI adapters, isolated profiles, session binding, routing and process ownership. Pattern names such as `get-module-pattern` and `get-repository-pattern` do not introduce NestJS modules, Prisma models or an application database.

The initial family version is `0.0.1`. The package targets public GitHub Packages under `@pixel-brewery`; install a published version after registry verification. The MIT-licensed source is being prepared for public hosting at [pixel-brewery/synapse](https://github.com/pixel-brewery/synapse). The owner completes repository transfer and public visibility through the [source launch steps](releases.md#public-source-launch), independently of package publication.

## Build and start from a checkout

Use Node.js **24.15.0+** and the checkout's pinned Yarn. From the Synapse workspace root:

```sh
yarn nx run synapse-mcp:build
yarn workspace @pixel-brewery/synapse-mcp start
```

The Nx build first checks the nine-library TypeDoc reference for drift, then compiles the CLI and writes its knowledge corpus to `tools/mcp/dist/data/corpus.json`. After changing exported API documentation, explicitly run `yarn docs` before building. The build does not silently regenerate stale API pages.

A directly started server waits for MCP messages on stdin; the intended caller is an MCP client. Stdout is reserved for protocol traffic, with diagnostics on stderr. Stop a manually started server with Ctrl+C; an MCP client owns the process it starts.

For another project or a GUI client, configure the built entry point using a user-filled absolute path. The examples below use `/absolute/path/to/synapse/tools/mcp/dist/main.js`; replace it with the actual built file. On Windows, an absolute path such as `C:/projects/synapse/tools/mcp/dist/main.js` avoids JSON backslash escaping. `node` must resolve to Node.js 24.15+ in the client's environment; otherwise supply the actual Node executable path.

The entry point locates its bundled corpus relative to the package, so these examples do not depend on the client's current directory. The checkout's own canonical registry is [`.vscode/mcp.json`](../../.vscode/mcp.json); `yarn agents:sync` projects that registry into the supported clients. Edit the canonical registry, not its generated adapters.

## Client configuration

### Codex

In an appropriate user or trusted-project `config.toml`:

```toml
[mcp_servers.synapse]
command = "node"
args = ["/absolute/path/to/synapse/tools/mcp/dist/main.js"]
```

Codex supports this `command`/`args` stdio form and an optional `cwd` when using a project-relative command. See the [official OpenAI MCP configuration](https://learn.chatgpt.com/docs/extend/mcp#stdio-servers). The absolute entry point above needs no `cwd` override or MCP login.

### Claude Code

For a project-scoped `.mcp.json`:

```json
{
    "mcpServers": {
        "synapse": {
            "type": "stdio",
            "command": "node",
            "args": ["/absolute/path/to/synapse/tools/mcp/dist/main.js"]
        }
    }
}
```

### OpenCode

In the project's `opencode.json`:

```json
{
    "mcp": {
        "synapse": {
            "type": "local",
            "command": ["node", "/absolute/path/to/synapse/tools/mcp/dist/main.js"],
            "enabled": true
        }
    }
}
```

### Generic stdio client or VS Code

Supply `node` as the executable, the absolute CLI path as its first argument, and connect stdin/stdout using the client's stdio transport. A VS Code `.vscode/mcp.json` example is:

```json
{
    "servers": {
        "synapse": {
            "type": "stdio",
            "command": "node",
            "args": ["/absolute/path/to/synapse/tools/mcp/dist/main.js"]
        }
    }
}
```

No provider executable, account environment, credentials or API key is needed for any of these configurations. Client trust/approval settings remain the client's responsibility.

## The 15 tools

Tool results use MCP text content. The tool schemas exposed by the running server are authoritative for validation. Empty input is `{}`; optional fields can be omitted. Documentation lookups use the directory names returned by `list-packages` and the names returned by `list-guides`.

| Tool                         | Input                                                               | Synapse result                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `list-packages`              | `{}`                                                                | Nine documented runtime packages with package names, descriptions and tags.                                                           |
| `get-package-doc`            | `{ packageName: string }`                                           | Package overview plus its complete generated API Markdown, including nested class/interface/member pages. Example: `synapse-runtime`. |
| `search-docs`                | `{ query: string }`                                                 | Matching package documentation, including generated API content.                                                                      |
| `list-guides`                | `{}`                                                                | Authored integration and architecture documents with names, titles, descriptions and ordering.                                        |
| `get-guide`                  | `{ guideName: string }`                                             | A complete authored document. Example: `consumers`; architecture identities use an `architecture-` prefix.                            |
| `search-guides`              | `{ query: string }`                                                 | Matching integration and architecture documents.                                                                                      |
| `get-query-pattern`          | `{ modelName?: string, fields?: string[] }`                         | `IAiRequest`/`AiRuntime.run` guidance; optional native model ID and result fields append an illustrative JSON Schema request.         |
| `get-repository-pattern`     | `{ modelName?: string, fields?: string[] }`                         | `RoutingStoreBase`/`ProfileSessionStoreBase` guidance; optional host storage namespace and fields append a host-owned projection.     |
| `get-mapping-pattern`        | `{ entityName?: string, fields?: string[], responseName?: string }` | Validated native-message normalization into neutral contracts, with optional source/target context.                                   |
| `get-module-pattern`         | `{ moduleName?: string, bases?: string[] }`                         | Package boundaries and explicit constructor composition, with optional component/base context.                                        |
| `get-error-handling-pattern` | `{}`                                                                | Typed errors, retry eligibility, session usability and unconfirmed cleanup.                                                           |
| `get-config-pattern`         | `{}`                                                                | Explicit host configuration, isolated profiles and environment ownership.                                                             |
| `get-guard-pattern`          | `{}`                                                                | Capability/policy validation, profile admission and execution safety boundaries.                                                      |
| `get-dto-pattern`            | `{}`                                                                | Immutable neutral contracts, runtime validation and serialization.                                                                    |
| `get-testing-pattern`        | `{}`                                                                | Adjacent specs, AAA, external transport fixtures and meaningful lifecycle tests.                                                      |

The optional context keys retain their Archipel spelling. For query examples, `modelName` is a host-selected native model ID; for repository examples it labels a host storage namespace. Neither implies a Prisma model. Query/repository examples require both `modelName` and a nonempty `fields` array; mapping examples require `entityName` and nonempty `fields`; module examples require `moduleName` and nonempty `bases`. Otherwise the tool returns its full base pattern without an appended example. Mapping `responseName` defaults to the entity label followed by `Response`.

All tool schemas reject unknown keys. Package/guide IDs and optional naming fields are trimmed, nonempty strings of at most 128 characters. A search query is trimmed and contains 1–256 characters. `fields` and `bases` accept at most 64 nonempty strings of at most 128 characters each; base names must end in `Base`. Contextual examples remain inert text: they never write project files, compile code or install a framework.

List results are JSON encoded inside MCP text content. Package rows contain `name`, `package`, `description` and `tags`; guide rows contain `name`, `title`, `description` and `order`. Search is a case-insensitive substring match across package metadata, README and complete API text, or guide identities/headings/descriptions/content. It returns complete matching contents without pagination or silent truncation. No matches produce explanatory non-error text; unknown lookup IDs and responses exceeding the eight-MiB UTF-8 result budget produce `isError: true`.

An initial client workflow can call:

```json
{
    "name": "get-package-doc",
    "arguments": { "packageName": "synapse-auth" }
}
```

Then request `get-guide` with `{ "guideName": "consumers" }` and the relevant pattern tool. An unknown package or guide is a lookup error, rather than a reason to fetch arbitrary paths or run a provider.

## Corpus ownership and boundaries

The built package carries its corpus in `dist/data/corpus.json`, independently of the Synapse checkout. It is assembled from the nine package READMEs/manifests, the existing TypeDoc API Markdown/index, authored `.docs/guides/`, `.docs/architecture/` and nine authored `.docs/patterns/` documents. Generated API directories are included recursively, so the corpus contains exported members and nested reference pages in addition to entrypoint summaries. Ordinary guide IDs use the file basename; architecture IDs are prefixed with `architecture-`. Use `list-guides` to discover the actual snapshot.

Startup loads one immutable corpus with an eight-MiB input limit. The loader rejects unsupported schemas, duplicate identities, invalid UTF-8, unsafe files and missing/oversized fields. It accepts at most 64 packages, 256 guides and 64 patterns; individual package API text is bounded at four MiB, overview text at 512 KiB and guide/pattern text at one MiB. The current build contains exactly nine runtime packages and nine patterns. There is no current-directory discovery or fallback to another checkout.

Source declarations and TSDoc remain the API authority. TypeDoc remains the sole API generator; the MCP server consumes that output rather than maintaining another symbol inventory. Edit the relevant library source, README, guide or pattern, then rebuild the MCP package. Do not hand-edit the built corpus.

The server serves this bundled development knowledge. It does not inspect application profiles, discover local AI accounts, start provider CLIs, perform inference, initiate authentication, mutate credentials or operate a host application. It starts no HTTP listener and needs no privileged account. An AI client may use the returned knowledge while working on a project under that client's own permissions.

## Registry installation and archive alternative

After [configuring GitHub registry authentication](consumers.md#install-from-github-packages) and verifying the published version, install and run the public CLI from your project:

```sh
yarn add -D @pixel-brewery/synapse-mcp@0.0.1
yarn exec synapse-mcp
```

Registry authentication is required even though the package is public; no native AI account is needed to serve the corpus. For local evaluation, a maintainer can instead pack a built CLI into an existing output directory:

```sh
yarn workspace @pixel-brewery/synapse-mcp pack --out /absolute/output/synapse-mcp-0.0.1.tgz
```

Copy that archive into the consuming project's `vendor/` directory and install it from that project:

```sh
yarn add -D @pixel-brewery/synapse-mcp@file:./vendor/synapse-mcp-0.0.1.tgz
yarn exec synapse-mcp
```

The installed archive includes the built corpus. It needs neither the Synapse source tree nor a separately hosted documentation site. Configure the client with the installed command and the consuming project's working directory, or use a verified absolute path to a built CLI as above. Native Windows hosts can use an owner-chosen Windows output path when packing.

An npm-based client may use `npx @pixel-brewery/synapse-mcp@0.0.1` after the published version is verified and its npm GitHub scope/authentication is configured. Yarn configuration alone does not configure npm/npx. Package publication is to GitHub Packages; public source hosting follows the owner's separate launch steps. See [release preparation](releases.md) and the [package README](../../tools/mcp/README.md).
