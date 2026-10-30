// #region Imports

import { defineConfig } from 'vitest/config';

// #endregion

export default defineConfig({
    test: {
        include: ['tools/*.spec.mjs'],
        maxWorkers: 1,
        fileParallelism: false,
    },
});
