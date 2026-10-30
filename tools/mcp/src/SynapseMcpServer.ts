// #region Imports

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { IKnowledgeCorpus } from './interfaces/IKnowledgeCorpus.js';
import { registerGetConfigPatternTool } from './tools/registerGetConfigPatternTool.js';
import { registerGetDtoPatternTool } from './tools/registerGetDtoPatternTool.js';
import { registerGetErrorHandlingPatternTool } from './tools/registerGetErrorHandlingPatternTool.js';
import { registerGetGuardPatternTool } from './tools/registerGetGuardPatternTool.js';
import { registerGetGuideTool } from './tools/registerGetGuideTool.js';
import { registerGetMappingPatternTool } from './tools/registerGetMappingPatternTool.js';
import { registerGetModulePatternTool } from './tools/registerGetModulePatternTool.js';
import { registerGetPackageDocTool } from './tools/registerGetPackageDocTool.js';
import { registerGetQueryPatternTool } from './tools/registerGetQueryPatternTool.js';
import { registerGetRepositoryPatternTool } from './tools/registerGetRepositoryPatternTool.js';
import { registerGetTestingPatternTool } from './tools/registerGetTestingPatternTool.js';
import { registerListGuidesTool } from './tools/registerListGuidesTool.js';
import { registerListPackagesTool } from './tools/registerListPackagesTool.js';
import { registerSearchDocsTool } from './tools/registerSearchDocsTool.js';
import { registerSearchGuidesTool } from './tools/registerSearchGuidesTool.js';

// #endregion

/**
 * Explicit SDK composition of the fifteen read-only Synapse knowledge tools.
 *
 * @remarks Construction registers handlers only on this local server. Imports and construction perform no file discovery, process execution, network access, authentication or global listener registration.
 *
 * @internal
 */
export class SynapseMcpServer {
    // #region Fields

    private readonly _server: McpServer;
    private readonly _closed: Promise<void>;
    private _resolveClosed: () => void = () => undefined;
    private _connected = false;
    private _disposal?: Promise<void>;

    // #endregion

    // #region Ctor

    /**
     * Composes the server around an explicitly loaded, validated documentation snapshot.
     *
     * @param corpus - Complete immutable knowledge snapshot produced by the corpus owner.
     * @param version - Actual package version read by the explicit bootstrap, never a hardcoded protocol version.
     * @throws An Error when the supplied package version is invalid.
     *
     * @public
     */
    public constructor(corpus: IKnowledgeCorpus, version: string) {
        if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version))
            throw new Error('The MCP package version must be a valid semantic version.');

        this._closed = new Promise<void>((resolveClosed) => {
            this._resolveClosed = resolveClosed;
        });
        this._server = new McpServer(
            {
                name: 'synapse-mcp',
                version,
                title: 'Synapse knowledge server',
                description:
                    'Read-only local documentation, API references and architecture patterns for Synapse.',
            },
            { maxToolInputElements: 256 },
        );
        this._server.server.onclose = () => this._resolveClosed();

        registerListPackagesTool(this._server, corpus);
        registerGetPackageDocTool(this._server, corpus);
        registerSearchDocsTool(this._server, corpus);
        registerListGuidesTool(this._server, corpus);
        registerGetGuideTool(this._server, corpus);
        registerSearchGuidesTool(this._server, corpus);
        registerGetQueryPatternTool(this._server, corpus);
        registerGetRepositoryPatternTool(this._server, corpus);
        registerGetMappingPatternTool(this._server, corpus);
        registerGetModulePatternTool(this._server, corpus);
        registerGetErrorHandlingPatternTool(this._server, corpus);
        registerGetConfigPatternTool(this._server, corpus);
        registerGetGuardPatternTool(this._server, corpus);
        registerGetDtoPatternTool(this._server, corpus);
        registerGetTestingPatternTool(this._server, corpus);
    }

    // #endregion

    // #region Properties

    /**
     * Completes when the owned transport closes or explicit disposal finishes.
     *
     * @returns The same closure promise for the lifetime of this composition.
     *
     * @public
     */
    public get closed(): Promise<void> {
        return this._closed;
    }

    // #endregion

    // #region Methods

    /**
     * Transfers one explicit transport to the SDK and starts its protocol lifecycle.
     *
     * @param transport - Fresh owned stdio or test transport; no transport is created implicitly.
     * @returns Completion of SDK transport startup.
     * @throws An Error when this server was already connected or disposal started, or when SDK startup fails.
     *
     * @public
     */
    public async connect(transport: Transport): Promise<void> {
        if (this._connected || this._disposal)
            throw new Error('The MCP server accepts one transport before disposal.');

        this._connected = true;

        await this._server.connect(transport);
    }

    /**
     * Idempotently closes the owned SDK transport within a three-second cleanup budget.
     *
     * @returns Completion after transport shutdown; concurrent callers share the same result.
     * @throws An Error when the SDK cannot confirm closure within its cleanup budget.
     *
     * @public
     */
    public dispose(): Promise<void> {
        this._disposal ??= this.close();

        return this._disposal;
    }

    private async close(): Promise<void> {
        let timer: ReturnType<typeof setTimeout> | undefined;

        try {
            await Promise.race([
                this._server.close(),
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(
                        () =>
                            reject(
                                new Error('The MCP transport did not close within three seconds.'),
                            ),
                        3000,
                    );
                }),
            ]);
        } finally {
            clearTimeout(timer);
            this._resolveClosed();
        }
    }

    // #endregion
}
