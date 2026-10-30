// #region Imports

import {
    AiAuthDriverBase,
    AiError,
    isCleanupIncomplete,
    type IAiAuthContext,
    type IAiAuthMethod,
    type IAiAuthStatus,
    type IAiInstance,
} from '@pixel-brewery/synapse-core';
import type {
    IInteractiveProcess,
    IProcessResult,
    ProcessRunnerBase,
} from '@pixel-brewery/synapse-runtime';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { isOpenCodeCredential } from '../isOpenCodeCredential.js';
import { openCodeConfiguration } from '../openCodeConfiguration.js';
import { openCodeEnvironment } from '../openCodeEnvironment.js';

// #endregion

/**
 * Native OpenCode login/logout procedures scoped to one configured provider account.
 *
 * @public
 */
export class OpenCodeAuthDriver extends AiAuthDriverBase {
    // #region Ctor

    /**
     * Creates an inert native authentication adapter.
     *
     * @param _runner - Shared owned-process execution boundary.
     *
     * @public
     */
    public constructor(private readonly _runner: ProcessRunnerBase) {
        super();
    }

    // #endregion

    // #region Methods

    /**
     * Reports the native procedure only when provider and method selection are explicit.
     *
     * @param instance - Isolated instance containing the provider's native login method label.
     * @returns Supported native procedures; an unconfigured selector advertises none.
     *
     * @public
     */
    public override methods(instance: IAiInstance): readonly IAiAuthMethod[] {
        const config = openCodeConfiguration(instance);

        return config.providerId && config.authMethod
            ? [{ id: 'native', label: 'OpenCode native provider login', kind: 'terminal' }]
            : [];
    }

    /**
     * Reads the CLI's isolated stored-credential listing without login or inference.
     *
     * @param instance - Account profile whose native credentials are inspected.
     * @param signal - Bounded inspection cancellation.
     * @returns Whether OpenCode lists credentials for the configured account.
     * @throws An AiError when the native status command fails.
     * @remarks Stored credentials do not prove a provider subscription entitlement or remote token validity.
     *
     * @public
     */
    public override async status(
        instance: IAiInstance,
        signal: AbortSignal,
    ): Promise<IAiAuthStatus> {
        const config = openCodeConfiguration(instance);
        const result = await this._runner.run({
            executable: instance.executable ?? 'opencode',
            args: ['--pure', 'auth', 'list'],
            workingDirectory: instance.profile.paths.home,
            environment: await openCodeEnvironment(instance),
            signal,
            timeoutMs: 10_000,
        });

        if (result.exitCode !== 0)
            throw new AiError('provider', 'OpenCode could not inspect its native credentials.');

        const credentials = await storedCredentials(instance);

        if (signal.aborted)
            throw signal.reason instanceof AiError
                ? signal.reason
                : new AiError('cancelled', 'OpenCode credential inspection was cancelled.');

        const credential = config.providerId ? credentials[config.providerId] : undefined;
        const authenticated = config.providerId
            ? isOpenCodeCredential(credential)
            : Object.values(credentials).some(isOpenCodeCredential);

        return {
            authenticated,
            ...(isOpenCodeCredential(credential) && typeof credential['accountId'] === 'string'
                ? { accountId: credential['accountId'] }
                : {}),
            message: authenticated
                ? 'OpenCode lists stored credentials for this profile.'
                : 'OpenCode has no matching stored credentials in this profile.',
        };
    }

    /**
     * Runs the configured native method and presents only safe login interactions.
     *
     * @param context - Exclusive profile flow with correlated owner-validated responses.
     * @returns Completion after the native login process exits successfully.
     * @throws An AiError for unsupported procedures, native login failure or cancellation.
     *
     * @public
     */
    public override async login(context: IAiAuthContext): Promise<void> {
        const config = openCodeConfiguration(context.instance);

        if (context.methodId !== 'native' || !config.providerId || !config.authMethod)
            throw new AiError(
                'unsupported',
                'OpenCode login requires an explicit provider and native method label.',
            );

        let control: IInteractiveProcess | undefined;
        let presented = false;
        let buffered = '';
        let responseFailure: unknown;
        let stopFailure: { readonly cause: unknown } | undefined;
        let stopping: Promise<void> | undefined;
        const inspect = (chunk: string): void => {
            buffered = stripVTControlCharacters((buffered + chunk).slice(-16_384));

            if (presented || !control) return;

            if (/https?:\/\/[^\s<>"\p{Cc}]*$/u.test(buffered)) return;

            const candidate = buffered.match(/https?:\/\/[^\s<>"\p{Cc}]+(?=[\s<>"\p{Cc}])/u)?.[0];
            const prompt =
                /(?:api.?key|paste|verification.?code|authorization.?code|enter.*code|token)/iu.test(
                    buffered,
                );

            if (!candidate && !prompt) return;

            let url: string | undefined;

            if (candidate) {
                try {
                    const parsed = new URL(candidate);

                    if (
                        ['http:', 'https:'].includes(parsed.protocol) &&
                        !parsed.username &&
                        !parsed.password
                    )
                        url = parsed.toString();
                } catch {
                    /* Only complete native URLs are presented. */
                }
            }

            if (!url && !prompt) return;

            presented = true;

            const id = randomUUID();

            context.interaction({
                id,
                type: url ? 'browser' : 'terminal',
                expiresAt: Date.now() + 10 * 60_000,
                message: url
                    ? 'Complete the native OpenCode sign-in. Submit a code only if the provider requests one.'
                    : 'Supply the input requested by the selected native OpenCode login method.',
                ...(url ? { url } : {}),
                fields: [
                    { id: 'input', label: 'Native login input or verification code', secret: true },
                ],
            });
            void context
                .response(id)
                .then((values) => {
                    if (!context.signal.aborted && values['input'])
                        control?.write(`${values['input']}\n`);
                })
                .catch((cause: unknown) => {
                    if (!context.signal.aborted) {
                        responseFailure = cause;
                        stopping = control?.stop().catch((cleanup: unknown) => {
                            stopFailure = { cause: cleanup };
                        });
                    }
                });
        };
        let result: IProcessResult;

        try {
            result = await this._runner.run({
                executable: context.instance.executable ?? 'opencode',
                args: [
                    '--pure',
                    'auth',
                    'login',
                    '--provider',
                    config.providerId,
                    '--method',
                    config.authMethod,
                ],
                workingDirectory: context.instance.profile.paths.home,
                environment: await openCodeEnvironment(context.instance),
                signal: context.signal,
                keepInputOpen: true,
                timeoutMs: 10 * 60_000,
                onStart: (process) => {
                    control = process;
                },
                onStdout: inspect,
                onStderr: inspect,
            });
        } catch (cause) {
            await stopping;

            if (isCleanupIncomplete(cause)) throw cause;

            if (stopFailure) throw stopFailure.cause;

            throw cause;
        }

        await stopping;

        if (stopFailure) throw stopFailure.cause;

        if (responseFailure) throw responseFailure;

        if (result.exitCode !== 0)
            throw new AiError('auth-required', 'OpenCode native provider login did not complete.');
    }

    /**
     * Logs out only the configured native provider in this isolated profile.
     *
     * @param instance - Account profile after shared auth admission has drained its executions.
     * @param signal - Logout cancellation.
     * @returns Completion of the native credential removal.
     * @throws An AiError if provider selection is missing or native logout fails.
     *
     * @public
     */
    public override async logout(instance: IAiInstance, signal: AbortSignal): Promise<void> {
        const providerId = openCodeConfiguration(instance).providerId;

        if (!providerId)
            throw new AiError('unsupported', 'OpenCode logout requires an explicit provider.');

        const result = await this._runner.run({
            executable: instance.executable ?? 'opencode',
            args: ['--pure', 'auth', 'logout', providerId],
            workingDirectory: instance.profile.paths.home,
            environment: await openCodeEnvironment(instance),
            signal,
            timeoutMs: 10_000,
        });

        if (result.exitCode !== 0) throw new AiError('provider', 'OpenCode native logout failed.');
    }

    // #endregion
}

async function storedCredentials(instance: IAiInstance): Promise<Record<string, unknown>> {
    const inline = instance.environment?.['OPENCODE_AUTH_CONTENT'];

    if (inline !== undefined) {
        if (Buffer.byteLength(inline) > 2 * 1024 * 1024)
            throw new AiError('configuration', 'OpenCode inline credential data is too large.');

        let value: unknown;

        try {
            value = JSON.parse(inline);
        } catch {
            throw new AiError('configuration', 'OpenCode inline credential data is invalid.');
        }

        if (!record(value))
            throw new AiError('configuration', 'OpenCode inline credentials must be an object.');

        return value;
    }

    const file = join(instance.profile.paths.home, '.local', 'share', 'opencode', 'auth.json');

    try {
        const input = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));

        try {
            const metadata = await input.stat();

            if (!metadata.isFile() || metadata.size > 2 * 1024 * 1024)
                throw new AiError(
                    'configuration',
                    'OpenCode native credential state is invalid or too large.',
                );

            const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
            let length = 0;

            while (length < buffer.length) {
                const chunk = await input.read(buffer, length, buffer.length - length, null);

                if (!chunk.bytesRead) break;

                length += chunk.bytesRead;
            }

            if (length > 2 * 1024 * 1024)
                throw new AiError(
                    'configuration',
                    'OpenCode credential data exceeded its read limit.',
                );

            const value: unknown = JSON.parse(buffer.toString('utf8', 0, length));

            if (!record(value))
                throw new AiError('configuration', 'OpenCode native credential state is invalid.');

            return value;
        } finally {
            await input.close();
        }
    } catch (cause) {
        if (record(cause) && cause['code'] === 'ENOENT') return {};

        if (cause instanceof AiError) throw cause;

        throw new AiError('host', 'OpenCode native credentials could not be inspected.', { cause });
    }
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
