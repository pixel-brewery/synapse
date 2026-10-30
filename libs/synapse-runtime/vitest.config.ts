// #region Imports

import { defineConfig } from 'vitest/config';

// #endregion

export default defineConfig({
    test: {
        root: import.meta.dirname,
        include: ['src/**/*.spec.ts'],
        maxWorkers: 1,
        fileParallelism: false,
        testTimeout: 20_000,
    },
});
