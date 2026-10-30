// #region Imports

import { defineConfig } from 'vitest/config';

// #endregion

export default defineConfig({
    test: {
        include: ['tools/api-docs/*.spec.mjs'],
        maxWorkers: 1,
        fileParallelism: false,
        testTimeout: 60_000,
    },
});
