// #region Imports

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IAiAuthContext, IAiAuthInteraction, IAiInstance } from '@pixel-brewery/synapse-core';
import type {
    IProcessRequest,
    IProcessResult,
    ProcessRunnerBase,
} from '@pixel-brewery/synapse-runtime';
import { CodexAuthDriver } from './CodexAuthDriver.js';
import { prepareCodexCredentials } from '../profile/prepareCodexCredentials.js';

// #endregion

const owned: string[] = [];
const completed: IProcessResult = { stdout: '', stderr: '', exitCode: 0, signal: null };

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function instance(): Promise<IAiInstance> {
    const root = await mkdtemp(join(tmpdir(), 'synapse-codex-auth-'));

    owned.push(root);

    return {
        id: root,
        driverId: 'codex',
        profile: {
            id: root,
            applicationId: 'fixture-app',
            accountId: 'fixture-account',
            paths: {
                root,
                home: join(root, 'home'),
                credentials: join(root, 'credentials'),
                configuration: join(root, 'configuration'),
                execution: join(root, 'execution'),
                temporary: join(root, 'tmp'),
            },
        },
    };
}

function runner(run: (request: IProcessRequest) => Promise<IProcessResult>): ProcessRunnerBase {
    return { run: vi.fn(run), dispose: vi.fn(async () => undefined) };
}

function context(
    account: IAiInstance,
    methodId: string,
    interactions: IAiAuthInteraction[] = [],
    response: IAiAuthContext['response'] = async () => ({}),
): IAiAuthContext {
    return {
        instance: account,
        methodId,
        signal: new AbortController().signal,
        interaction: (value) => {
            interactions.push(value);
        },
        response,
    };
}

describe('CodexAuthDriver', () => {
    it('publishes only a complete fragmented browser URL and never requests a credential response', async () => {
        // Arrange
        const account = await instance();
        const interactions: IAiAuthInteraction[] = [];
        const response = vi.fn(async () => ({}));
        const login = context(account, 'chatgpt-browser', interactions, response);
        const url =
            'https://auth.openai.com/oauth/authorize?state=synthetic-state&client_id=synthetic-client';
        const transport = runner(async (request) => {
            for (const chunk of [url.slice(0, 48), url.slice(48), '\n'])
                await request.onStderr?.(chunk);

            return completed;
        });

        // Act
        await new CodexAuthDriver(transport).login(login);

        // Assert
        expect(interactions).toHaveLength(1);
        expect(interactions[0]).toMatchObject({ type: 'browser', url });
        expect(response).not.toHaveBeenCalled();
        expect(vi.mocked(transport.run).mock.calls[0]![0].environment['CODEX_HOME']).toBe(
            account.profile.paths.credentials,
        );
    });

    it('publishes a native device URL with the complete verification code', async () => {
        // Arrange
        const account = await instance();
        const interactions: IAiAuthInteraction[] = [];
        const transport = runner(async (request) => {
            await request.onStdout?.('Open https://auth.openai.com/codex/device\nCode: ABCD-EF');
            await request.onStdout?.('GHI\n');

            return completed;
        });

        // Act
        await new CodexAuthDriver(transport).login(
            context(account, 'chatgpt-device', interactions),
        );

        // Assert
        expect(interactions).toHaveLength(1);
        expect(interactions[0]).toMatchObject({
            type: 'device-code',
            url: 'https://auth.openai.com/codex/device',
            code: 'ABCD-EFGHI',
        });
        expect(vi.mocked(transport.run).mock.calls[0]![0].args).toEqual(['login', '--device-auth']);
    });

    it.each([
        ['api-key', 'apiKey', '--with-api-key'],
        ['access-token', 'accessToken', '--with-access-token'],
    ])('sends %s only through native stdin', async (method, field, flag) => {
        // Arrange
        const account = await instance();
        const interactions: IAiAuthInteraction[] = [];
        const credential = 'synthetic-private-credential';
        const transport = runner(async () => completed);

        // Act
        await new CodexAuthDriver(transport).login(
            context(account, method, interactions, async () => ({ [field]: credential })),
        );

        // Assert
        const request = vi.mocked(transport.run).mock.calls[0]![0];

        expect(request.args).toEqual(['login', flag]);
        expect(request.input).toBe(`${credential}\n`);
        expect(request.args).not.toContain(credential);
        expect(JSON.stringify(interactions)).not.toContain(credential);
        expect(interactions[0]).toMatchObject({
            type: 'credentials',
            fields: [{ id: field, secret: true, required: true }],
        });
    });

    it('rejects malformed credentials before launching a native process', async () => {
        // Arrange
        const account = await instance();
        const transport = runner(async () => completed);

        // Act
        const result = new CodexAuthDriver(transport).login(
            context(account, 'api-key', [], async () => ({ apiKey: 'synthetic\ninvalid' })),
        );

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'configuration' });
        expect(transport.run).not.toHaveBeenCalled();
    });

    it('checks login status without returning private native output', async () => {
        // Arrange
        const account = await instance();
        const transport = runner(async () => ({
            ...completed,
            stderr: 'Logged in using API key: sk-synthetic-secret-do-not-expose',
        }));

        // Act
        const status = await new CodexAuthDriver(transport).status(
            account,
            new AbortController().signal,
        );

        // Assert
        expect(status.authenticated).toBe(true);
        expect(status.method).toBe('api-key');
        expect(JSON.stringify(status)).not.toContain('sk-synthetic');
        expect(vi.mocked(transport.run).mock.calls[0]![0].args).toEqual(['login', 'status']);
    });

    it('removes an owned snapshot first created by native execution without a root auth file', async () => {
        // Arrange
        const account = await instance();
        const snapshot = await prepareCodexCredentials(account);

        await writeFile(snapshot.target, '{"token":"synthetic-native-created"}');

        const transport = runner(async () => completed);

        // Act
        await new CodexAuthDriver(transport).logout(account, new AbortController().signal);

        // Assert
        await expect(readFile(snapshot.target, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('removes only owned execution snapshots during logout', async () => {
        // Arrange
        const account = await instance();

        await mkdir(account.profile.paths.credentials);

        const source = join(account.profile.paths.credentials, 'auth.json');

        await writeFile(source, '{"token":"synthetic"}');

        const snapshot = await prepareCodexCredentials(account);
        const other = await instance();

        await mkdir(join(other.profile.paths.execution, 'codex'), { recursive: true });

        const foreign = join(other.profile.paths.execution, 'codex/auth.json');

        await writeFile(foreign, '{"token":"other-synthetic"}');

        const transport = runner(async () => {
            await rm(source);

            return completed;
        });

        // Act
        await new CodexAuthDriver(transport).logout(account, new AbortController().signal);

        // Assert
        await expect(readFile(snapshot.target, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await readFile(foreign, 'utf8')).toBe('{"token":"other-synthetic"}');
    });
});
