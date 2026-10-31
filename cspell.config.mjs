export default {
    version: '0.2',
    language: 'en,en-GB',
    enableGlobDot: true,
    dictionaryDefinitions: [
        {
            name: 'synapse',
            path: './cspell.words.txt',
            addWords: true,
        },
    ],
    dictionaries: ['synapse'],
    ignorePaths: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '/.git/**',
        '/.nx/**',
        '/.yarn/**',
        '/artifacts/**',
        '/yarn.lock',
        '/cspell.config.mjs',
        '/cspell.words.txt',
        '/.docs/api/**',
        '/.docs/packages/*/api/**',
        // These sources are byte-preserved upstream foundations or generated projections.
        '/.agents/skills/synapse-architect/SKILL.md',
        '/.agents/skills/architecture/**',
        '/.claude/skills/**',
        '/.opencode/skills/**',
        '/CODEX.md',
        '/CLAUDE.md',
        '/.github/copilot-instructions.md',
    ],
    overrides: [
        {
            filename: '**/*.spec.{ts,mjs}',
            words: ['EFGHI', 'Grüße', 'nestedonlycontinuationmarker'],
        },
        {
            filename: '**/fixtures/*.{json,jsonl,ndjson}',
            words: ['statusline'],
        },
        {
            filename: 'libs/synapse-runtime/src/boundedText.ts',
            // GitHub token-prefix character class, retained literally in the credential matcher.
            words: ['pousr'],
        },
    ],
};
