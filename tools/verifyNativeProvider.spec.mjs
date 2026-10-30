// #region Imports

import { AiAuthDriverBase, AiDriverBase, AiError } from '@pixel-brewery/synapse-core';
import { ProcessRunnerBase } from '@pixel-brewery/synapse-runtime';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { parseNativeOptions, verifyNativeProvider } from './verifyNativeProvider.mjs';

// #endregion

const owned = new Set();
const profileRoots = new Set();
const execute = promisify(execFile);

afterEach(async () => {
    for (const root of profileRoots)
        for (const entry of await readdir(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;

            try {
                const marker = JSON.parse(
                    await readFile(join(root, entry.name, '.synapse-profile.json'), 'utf8'),
                );

                if (typeof marker.paths?.temporary === 'string') owned.add(marker.paths.temporary);
            } catch (cause) {
                if (cause.code !== 'ENOENT') throw cause;
            }
        }

    await Promise.all(
        [...owned].map((directory) => rm(directory, { recursive: true, force: true })),
    );
    owned.clear();
    profileRoots.clear();
});

class ControlledAuth extends AiAuthDriverBase {
    // #region Fields

    statuses = [];
    logins = 0;
    logouts = 0;
    _primary;
    _authenticated;
    _isolatedAuthenticated;

    // #endregion

    // #region Ctor

    constructor(options) {
        super();
        this._authenticated = options.authenticated !== false;
        this._isolatedAuthenticated = options.isolatedAuthenticated === true;
    }

    // #endregion

    // #region Methods

    methods() {
        return [];
    }

    async status(instance, signal) {
        signal.throwIfAborted();
        this._primary ??= instance.profile.id;
        this.statuses.push(instance);
        owned.add(instance.profile.paths.temporary);

        return {
            authenticated:
                instance.profile.id === this._primary
                    ? this._authenticated
                    : this._isolatedAuthenticated,
        };
    }

    async login() {
        this.logins++;

        throw new Error('Verification must never initiate login.');
    }

    async logout() {
        this.logouts++;
        this._authenticated = false;
    }

    // #endregion
}

class ControlledDriver extends AiDriverBase {
    // #region Fields

    id = 'codex';
    capabilities = {
        modes: ['read-only'],
        resume: true,
        structuredOutput: 'validated',
        tools: false,
    };
    requests = [];
    disposals = 0;
    cancellationCleaned = false;
    auth;
    _options;
    _runner;
    _nonce;

    // #endregion

    // #region Ctor

    constructor(options, runner) {
        super();
        this._options = options;
        this._runner = runner;
        this.auth = new ControlledAuth(options);
    }

    // #endregion

    // #region Methods

    async execute(context) {
        this.requests.push(context);

        if (context.request.prompt.startsWith('Cancellation verification.')) {
            if (this._options.completeCancellation)
                return {
                    text: 'The fixture finished before observable native work.',
                    sessionId: 'already-completed-native-session',
                };

            try {
                await this._runner.run({
                    executable: 'controlled-native-process',
                    args: [],
                    input: 'controlled-cancellation',
                    workingDirectory: context.workingDirectory,
                    environment: {},
                    signal: context.signal,
                    onStdout: async () =>
                        context.emit({
                            type: 'progress',
                            category: 'message',
                            message: 'Controlled native execution is active.',
                        }),
                });
            } finally {
                await Promise.resolve();
                this.cancellationCleaned = true;
            }
        }

        const nonce = /VERIFICATION_NONCE: ([a-f\d-]+)/u.exec(context.request.prompt)?.[1];

        if (nonce) this._nonce = nonce;

        if (context.request.session || nonce) {
            const structured = {
                nonce:
                    this._options.forgetNonce && context.request.session
                        ? 'forgotten'
                        : this._nonce,
                acknowledged: true,
            };

            return { text: JSON.stringify(structured), sessionId: 'controlled-session' };
        }

        if (!this.cancellationCleaned)
            throw new Error('The recovery run started before cancellation cleanup completed.');

        return { text: '{"ok":true}', sessionId: 'controlled-recovery' };
    }

    async dispose() {
        this.disposals++;
    }

    // #endregion
}

class ControlledRunner extends ProcessRunnerBase {
    // #region Fields

    disposals = 0;
    failure;

    // #endregion

    // #region Methods

    async run(request) {
        if (request.input !== 'controlled-cancellation')
            throw new Error('The controlled transport only accepts the cancellation fixture.');

        await request.onStdout('Controlled native output.');
        request.signal.throwIfAborted();

        return new Promise((_resolve, reject) => {
            const abort = () => reject(request.signal.reason);

            request.signal.addEventListener('abort', abort, { once: true });

            if (request.signal.aborted) abort();
        });
    }

    async dispose() {
        this.disposals++;

        if (this.failure) throw this.failure;
    }

    // #endregion
}

function controlled(options = {}, runner = new ControlledRunner()) {
    let driver;

    return {
        runner,
        createDriver: (transport) => {
            driver = new ControlledDriver(options, transport);

            return driver;
        },
        get driver() {
            return driver;
        },
    };
}

async function fixture(flags = []) {
    const root = await mkdtemp(join(tmpdir(), 'synapse-native-check-'));

    owned.add(root);
    profileRoots.add(root);

    return parseNativeOptions([
        '--provider',
        'codex',
        '--profile-root',
        root,
        '--account',
        'native-test',
        ...flags,
    ]);
}

describe('native provider verification', () => {
    it('prints explicit preparation and usage without accessing a native account', async () => {
        // Arrange
        const environment = { ...process.env };

        delete environment.FORCE_COLOR;

        // Act
        const result = await execute(
            process.execPath,
            ['tools/verifyNativeProvider.mjs', '--help'],
            {
                env: environment,
                timeout: 5000,
            },
        );

        // Assert
        expect(result.stdout).toContain('--profile-root <absolute dedicated directory>');
        expect(result.stdout).toContain('--account <test account>');
        expect(result.stdout).toContain('does not initiate login');
        expect(result.stderr).toBe('');
    });

    it.each(
        [
            [],
            ['--provider', 'codex', '--account', 'test'],
            ['--provider', 'codex', '--profile-root', 'relative', '--account', 'test'],
            ['--provider', 'other', '--profile-root', resolve('profiles'), '--account', 'test'],
            ['--simulate'],
            ['--logout=false'],
            ['--provider', 'codex', '--provider', 'claude'],
        ].map((arguments_) => ({ arguments_ })),
    )('rejects incomplete or implicit native selections: $arguments_', ({ arguments_ }) => {
        // Arrange / Act / Assert
        expect(() => parseNativeOptions(arguments_)).toThrow(AiError);
    });

    it('imports without processes, filesystem discovery, network, timers or signal listeners', async () => {
        // Arrange
        const specifier = pathToFileURL(resolve('tools/verifyNativeProvider.mjs')).href;

        // Act
        const result = await execute(
            process.execPath,
            ['tools/packaging/importProbe.mjs', JSON.stringify([specifier])],
            { timeout: 5000 },
        );

        // Assert
        expect(JSON.parse(result.stdout)).toEqual({ imports: 1, effects: [] });
    });

    it('checks real runtime schema, complete resume ownership, active abort and later reuse without a native account', async () => {
        // Arrange
        const options = await fixture(['--model', 'test-model']);
        const dependencies = controlled();

        // Act
        const report = await verifyNativeProvider(options, dependencies);

        // Assert
        const { driver, runner } = dependencies;

        expect(report.checks).toEqual([
            'auth-status',
            'schema-json',
            'bound-resume',
            'active-cancellation',
            'reuse-after-cancellation',
            'profile-isolation',
            'foreign-session-rejected',
        ]);
        expect(report.logoutRequested).toBe(false);
        expect(driver.requests).toHaveLength(4);
        expect(driver.requests.every(({ request }) => request.model === 'test-model')).toBe(true);
        expect(driver.requests[1].request.session).toMatchObject({
            nativeId: 'controlled-session',
            driverId: 'codex',
            instanceId: 'meeting-account',
            candidateId: 'meeting-account',
            profileId: expect.any(String),
            authenticationGeneration: expect.any(String),
        });
        expect(driver.requests[1].request.prompt).not.toContain(driver._nonce);
        expect(JSON.stringify(driver.requests[1].request.outputSchema)).not.toContain(
            driver._nonce,
        );
        expect(driver.auth.statuses[0].profile.applicationId).toBe('synapse-meeting-notes-example');
        expect(driver.auth.statuses[1].profile.id).not.toBe(driver.auth.statuses[0].profile.id);
        expect(driver.auth.statuses[1].profile.applicationId).not.toBe(
            driver.auth.statuses[0].profile.applicationId,
        );
        expect(driver.auth.statuses[1].profile.accountId).not.toBe(
            driver.auth.statuses[0].profile.accountId,
        );
        expect(driver.auth.logins).toBe(0);
        expect(driver.auth.logouts).toBe(0);
        expect(driver.cancellationCleaned).toBe(true);
        expect(driver.disposals).toBe(1);
        expect(runner.disposals).toBe(1);
    });

    it('fails before inference without an explicitly prepared authenticated test profile', async () => {
        // Arrange
        const options = await fixture();
        const dependencies = controlled({ authenticated: false });

        // Act
        const result = verifyNativeProvider(options, dependencies);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'auth-required' });

        const { driver, runner } = dependencies;

        expect(driver.requests).toEqual([]);
        expect(driver.auth.logins).toBe(0);
        expect(driver.auth.logouts).toBe(0);
        expect(driver.disposals).toBe(1);
        expect(runner.disposals).toBe(1);
    });

    it.each([
        { options: { forgetNonce: true }, code: 'result-validation' },
        { options: { completeCancellation: true }, code: 'host' },
        { options: { isolatedAuthenticated: true }, code: 'host' },
    ])(
        'does not skip a failed native requirement: $options',
        async ({ options: behavior, code }) => {
            // Arrange
            const options = await fixture();
            const dependencies = controlled(behavior);

            // Act
            const result = verifyNativeProvider(options, dependencies);

            // Assert
            await expect(result).rejects.toMatchObject({ code });

            const { driver, runner } = dependencies;

            expect(driver.auth.logins).toBe(0);
            expect(driver.auth.logouts).toBe(0);
            expect(driver.disposals).toBe(1);
            expect(runner.disposals).toBe(1);
        },
    );

    it('performs logout only for its explicit flag and verifies signed-out status afterwards', async () => {
        // Arrange
        const options = await fixture(['--logout']);
        const dependencies = controlled();

        // Act
        const report = await verifyNativeProvider(options, dependencies);

        // Assert
        const { driver } = dependencies;

        expect(report.checks.at(-1)).toBe('logout-verified');
        expect(driver.auth.logouts).toBe(1);
        expect(driver.auth.logins).toBe(0);
        expect(driver.auth.statuses).toHaveLength(4);
        expect(driver.auth.statuses.at(-1).profile.id).toBe(driver.auth.statuses[0].profile.id);
    });

    it('does not print success when owned cleanup remains unconfirmed', async () => {
        // Arrange
        const options = await fixture();
        const runner = new ControlledRunner();
        const dependencies = controlled({}, runner);

        runner.failure = new AiError('host', 'Controlled native cleanup was not confirmed.', {
            cleanupIncomplete: true,
        });

        // Act
        const result = verifyNativeProvider(options, dependencies);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'host', cleanupIncomplete: true });
        expect(dependencies.driver.disposals).toBe(1);
        expect(runner.disposals).toBe(1);
    });
});
