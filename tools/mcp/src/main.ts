#!/usr/bin/env node

// #region Imports

import { startSynapseMcpServer } from './startSynapseMcpServer.js';

// #endregion

// This CLI-only launcher intentionally starts the session; reusable source modules remain inert.
void startSynapseMcpServer().catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'The knowledge server failed.';

    process.stderr.write(`[synapse-mcp] ${message.slice(0, 512)}\n`);
    process.exitCode = 1;
});
