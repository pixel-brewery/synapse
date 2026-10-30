/**
 * @type {import('lint-staged').Configuration}
 */
export default {
    '{libs/*,apps/*,tools/mcp}/src/**/*.ts': 'yarn exec eslint --fix',
    // Prettier applies .prettierignore, including generated and byte-preserved files.
    '*': 'yarn exec prettier --write --ignore-unknown',
};
