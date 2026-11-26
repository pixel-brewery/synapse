// #region Imports

// cspell:ignore permis

import { describe, expect, it } from 'vitest';
import { isReadonlyPullRequestWorkflow } from './isReadonlyPullRequestWorkflow.mjs';

// #endregion

const main = `name: Verify
on: [pull_request]
permissions:
    contents: read
    packages: read
jobs:
    verify:
        steps:
            - uses: actions/checkout@${'a'.repeat(40)} # v7
            - run: yarn verify
    gate:
        permissions: {}
        steps:
            - run: echo verified
`;

describe('Positively reviewed pull-request workflow identity', () => {
    it.each([undefined, '', 'unreviewed', 'a'.repeat(63)])(
        'rejects an absent or malformed fixed digest: %s',
        (digest) => {
            // Arrange
            const source = main;

            // Act
            const result = isReadonlyPullRequestWorkflow(source, source, digest);

            // Assert
            expect(result).toBe(false);
        },
    );
    it('does not learn even a benign equal main and PR edit as a reviewed baseline', () => {
        // Arrange
        const changed = main + '# newly changed CI requires review\n';

        // Act
        const result = isReadonlyPullRequestWorkflow(
            changed,
            changed,
            '7666990b20e570e683a0b890697382b57bbf112fd1a1cef730bbaa5285a1927e',
        );

        // Assert
        expect(result).toBe(false);
    });
    it('retains the fixed review digest across already merged action pin updates', () => {
        // Arrange
        const updated = main.replace('a'.repeat(40), 'b'.repeat(40));

        // Act
        const result = isReadonlyPullRequestWorkflow(
            updated,
            updated,
            '7666990b20e570e683a0b890697382b57bbf112fd1a1cef730bbaa5285a1927e',
        );

        // Assert
        expect(result).toBe(true);
    });

    it.each([
        ['unchanged source', main],
        [
            'full same-owner action pin and version',
            main.replace(`${'a'.repeat(40)} # v7`, `${'b'.repeat(40)} # v8.0.1`),
        ],
        [
            'native token alias',
            main.replace(
                'yarn verify',
                'yarn verify\n              env:\n                TOKEN: ${{ secrets.GITHUB_TOKEN }}',
            ),
        ],
    ])('accepts %s', (_name, text) => {
        // Arrange
        const baseline = _name === 'native token alias' ? text : main;
        const reviewed =
            _name === 'native token alias'
                ? 'a45fc69b199c2e802e4b86ea01bda5355fa0b6d25067dfb1bf90d4731e490aad'
                : '7666990b20e570e683a0b890697382b57bbf112fd1a1cef730bbaa5285a1927e';

        // Act
        const result = isReadonlyPullRequestWorkflow(baseline, text, reviewed);

        // Assert
        expect(result).toBe(true);
    });

    it.each([
        ['workflow write', main.replace('contents: read', 'contents: write')],
        ['job write', main.replace('permissions: {}', 'permissions: { contents: write }')],
        [
            'missing explicit root',
            main.replace('permissions:\n    contents: read\n    packages: read\n', ''),
        ],
        ['read-all shorthand', main.replace('permissions: {}', 'permissions: read-all')],
        ['custom secret', main.replace('yarn verify', 'echo ${{ secrets.PACKAGES_TOKEN }}')],
        ['all secrets', main.replace('yarn verify', 'echo ${{ toJSON(secrets) }}')],
        [
            'inherited secrets',
            main.replace('permissions: {}', 'permissions: {}\n        secrets: inherit'),
        ],
        ['YAML inherited permissions', main.replace('permissions: {}', 'permissions: *scope')],
        ['YAML merged job', main.replace('permissions: {}', '<<: *writable')],
        [
            'hidden flow permission',
            main.replace('permissions: {}', 'template: { permissions: write-all }'),
        ],
        [
            'escaped permission key',
            main.replace('permissions: {}', '"permis\\u0073ions": write-all'),
        ],
        ['foreign action owner', main.replace('actions/checkout', 'foreign/checkout')],
        ['foreign action path', main.replace('actions/checkout', 'actions/checkout/other')],
        ['mutable action tag', main.replace('a'.repeat(40), 'v8')],
        ['runtime edit', main.replace('yarn verify', 'echo skipped')],
        ['non-version action comment', main.replace('# v7', '# changed behavior')],
    ])('rejects unreviewed %s', (_name, changed) => {
        // Arrange
        const unsafeBaseline = [
            'workflow write',
            'job write',
            'missing explicit root',
            'read-all shorthand',
            'custom secret',
            'all secrets',
            'inherited secrets',
            'YAML inherited permissions',
            'YAML merged job',
            'hidden flow permission',
            'escaped permission key',
        ].includes(_name)
            ? changed
            : main;

        // Act
        const result = isReadonlyPullRequestWorkflow(
            unsafeBaseline,
            changed,
            '7666990b20e570e683a0b890697382b57bbf112fd1a1cef730bbaa5285a1927e',
        );

        // Assert
        expect(result).toBe(false);
    });
});
