// #region Imports

import {
    AiAuthDriverBase,
    AiError,
    type IAiAuthContext,
    type IAiAuthMethod,
    type IAiAuthStatus,
    type IAiInstance,
} from '@pixel-brewery/synapse-core';
import type { ProcessRunnerBase } from '@pixel-brewery/synapse-runtime';
import { randomUUID } from 'node:crypto';
import { lstat, readFile, readlink, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { createCodexEnvironment } from '../profile/createCodexEnvironment.js';
import { codexFailure } from '../protocol/codexFailure.js';

// #endregion

/**
 * Native Codex login procedures scoped to one application's account profile.
 *
 * @public
 */
export class CodexAuthDriver extends AiAuthDriverBase {
    // #region Ctor

    /**
     * Creates an inert authentication adapter.
     *
     * @param _runner - Explicit subprocess boundary shared with this Codex driver's executions.
     *
     * @public
     */
    public constructor(private readonly _runner: ProcessRunnerBase) {
        super();
    }

    // #endregion

    // #region Methods

    /**
     * Describes the native procedures supported by the characterized Codex CLI.
     *
     * @param _instance - Selected account; no state is read during method discovery.
     * @returns Browser, device code and stdin-based API/access-token procedures.
     *
     * @public
     */
    public override methods(_instance: IAiInstance): readonly IAiAuthMethod[] {
        void _instance;

        return [
            { id: 'chatgpt-browser', label: 'ChatGPT in browser', kind: 'browser' },
            { id: 'chatgpt-device', label: 'ChatGPT device code', kind: 'device-code' },
            { id: 'api-key', label: 'OpenAI API key', kind: 'credentials' },
            { id: 'access-token', label: 'Codex access token', kind: 'credentials' },
        ];
    }

    /**
     * Checks only native login status, without inference, hooks or a login attempt.
     *
     * @param instance - Isolated native credential owner.
     * @param signal - Bounded caller cancellation.
     * @returns Safe verified native authentication state.
     *
     * @public
     */
    public override async status(
        instance: IAiInstance,
        signal: AbortSignal,
    ): Promise<IAiAuthStatus> {
        const result = await this._runner.run({
            executable: instance.executable ?? 'codex',
            args: ['login', 'status'],
            environment: await createCodexEnvironment(instance),
            workingDirectory: instance.profile.paths.home,
            signal,
            timeoutMs: 15_000,
            maxOutputBytes: 65_536,
        });
        const authenticated = result.exitCode === 0;
        const nativeStatus = `${result.stdout}\n${result.stderr}`;
        const method =
            authenticated && /using\s+chatgpt/iu.test(nativeStatus)
                ? 'chatgpt'
                : authenticated && /using\s+(?:an?\s+)?api\s+key/iu.test(nativeStatus)
                  ? 'api-key'
                  : undefined;

        return {
            authenticated,
            ...(method ? { method } : {}),
            message:
                result.exitCode === 0
                    ? 'Codex authentication is available.'
                    : 'Codex is not authenticated.',
        };
    }

    /**
     * Runs one explicitly chosen native login; the shared auth owner verifies status afterward.
     *
     * @param context - Isolated, expiring operation and correlated user interactions.
     * @returns Completion after native login exits and owned process cleanup finishes.
     * @throws An AiError for unsupported methods, invalid credentials or native failure.
     *
     * @public
     */
    public override async login(context: IAiAuthContext): Promise<void> {
        const supported = this.methods(context.instance).some(
            (method) => method.id === context.methodId,
        );

        if (!supported)
            throw new AiError('unsupported', 'Codex does not support this authentication method.');

        const environment = await createCodexEnvironment(context.instance);
        let input: string | undefined;
        let args: readonly string[] = ['login'];

        if (context.methodId === 'api-key' || context.methodId === 'access-token') {
            const id = randomUUID();
            const field = context.methodId === 'api-key' ? 'apiKey' : 'accessToken';

            context.interaction({
                id,
                type: 'credentials',
                expiresAt: Date.now() + 600_000,
                message: 'Enter the credential for this isolated Codex account.',
                fields: [
                    {
                        id: field,
                        label: field === 'apiKey' ? 'API key' : 'Access token',
                        secret: true,
                        required: true,
                    },
                ],
            });

            const response = await context.response(id);
            const value = response[field]?.trim();

            if (!value || value.length > 65_536 || /[\r\n\0]/u.test(value))
                throw new AiError('configuration', 'Codex credential input is invalid.');

            input = `${value}\n`;
            args = [
                'login',
                context.methodId === 'api-key' ? '--with-api-key' : '--with-access-token',
            ];
        } else if (context.methodId === 'chatgpt-device') args = ['login', '--device-auth'];

        let output = '';
        let interactionShown = false;
        const inspect = (chunk: string): void => {
            output = stripVTControlCharacters((output + chunk).slice(-65_536));

            if (interactionShown || input !== undefined) return;

            const matches = output.match(/https:\/\/[^\s<>"']+(?=[\s<>"'])/gu) ?? [];
            const url = matches.find((candidate) => {
                try {
                    const parsed = new URL(candidate);

                    return (
                        parsed.protocol === 'https:' &&
                        parsed.hostname === 'auth.openai.com' &&
                        (parsed.pathname.startsWith('/oauth/authorize') ||
                            parsed.pathname.includes('/device'))
                    );
                } catch {
                    return false;
                }
            });

            if (!url) return;

            const code = /\b([A-Z0-9]{4,12}-[A-Z0-9]{4,12})(?=\s)/u.exec(output)?.[1];

            if (context.methodId === 'chatgpt-device' && !code) return;

            interactionShown = true;
            context.interaction({
                id: randomUUID(),
                type: context.methodId === 'chatgpt-device' ? 'device-code' : 'browser',
                expiresAt: Date.now() + 600_000,
                url,
                ...(code ? { code } : {}),
                message: 'Complete native Codex sign-in for this account.',
            });
        };
        const result = await this._runner.run({
            executable: context.instance.executable ?? 'codex',
            args,
            environment,
            workingDirectory: context.instance.profile.paths.home,
            ...(input !== undefined ? { input } : {}),
            signal: context.signal,
            timeoutMs: 600_000,
            maxOutputBytes: 262_144,
            onStdout: inspect,
            onStderr: inspect,
        });

        if (result.exitCode !== 0) throw codexFailure(result.stderr);
    }

    /**
     * Signs out only this account and removes its owned execution credential snapshots.
     *
     * @param instance - Isolated native credential owner.
     * @param signal - Logout cancellation, controlled by the shared auth lifecycle.
     * @returns Completion after native logout and owned snapshot cleanup.
     * @throws An AiError when native logout or local cleanup fails.
     *
     * @public
     */
    public override async logout(instance: IAiInstance, signal: AbortSignal): Promise<void> {
        const result = await this._runner.run({
            executable: instance.executable ?? 'codex',
            args: ['logout'],
            environment: await createCodexEnvironment(instance),
            workingDirectory: instance.profile.paths.home,
            signal,
            timeoutMs: 30_000,
            maxOutputBytes: 65_536,
        });

        if (result.exitCode !== 0) throw codexFailure(result.stderr);

        for (const name of ['codex', 'inspection'])
            await this.removeSnapshot(instance, join(instance.profile.paths.execution, name));
    }

    private async removeSnapshot(instance: IAiInstance, home: string): Promise<void> {
        const target = join(home, 'auth.json');
        const marker = join(home, '.synapse-auth-owner.json');
        const source = resolve(instance.profile.paths.credentials, 'auth.json');

        try {
            const current = await lstat(target);
            let owned = false;

            if (current.isSymbolicLink())
                owned = resolve(dirname(target), await readlink(target)) === source;
            else {
                let value: unknown;

                try {
                    value = JSON.parse(await readFile(marker, 'utf8'));
                } catch {
                    return;
                }

                owned = Boolean(
                    value &&
                    typeof value === 'object' &&
                    'profileId' in value &&
                    value.profileId === instance.profile.id &&
                    'source' in value &&
                    value.source === source,
                );
            }

            if (owned) {
                await rm(target, { force: true });
                await rm(marker, { force: true });
            }
        } catch (cause) {
            if (!(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT'))
                throw new AiError('host', 'Could not clear Codex execution credentials.', {
                    cause,
                });
        }
    }

    // #endregion
}
