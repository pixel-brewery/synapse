// #region Imports

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// #endregion

export default tseslint.config(
    { ignores: ['**/dist/**', '**/node_modules/**', '.nx/**'] },
    {
        files: ['libs/**/*.ts', 'apps/**/*.ts', 'tools/mcp/**/*.ts'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
        },
    },
);
