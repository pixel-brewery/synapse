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
import {
    boundedText,
    type IInteractiveProcess,
    type IProcessResult,
    type ProcessRunnerBase,
} from '@pixel-brewery/synapse-runtime';
import { randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { createClaudeEnvironment } from '../profile/createClaudeEnvironment.js';
import { claudeFailure } from '../protocol/claudeFailure.js';

// #endregion

/**
 * Native subscription, console and SSO authentication without a Synapse token broker.
 *
 * @public
 */
export class ClaudeAuthDriver extends AiAuthDriverBase {
    // #region Ctor

    /**
     * Creates an inert native authentication adapter.
     *
     * @param _runner - Subprocess owner shared with this Claude driver's execution.
     *
     * @public
     */
    public constructor(private readonly _runner: ProcessRunnerBase) {
        super();
    }

    // #endregion

    // #region Methods

    /**
     * Lists only procedures supported by the characterized native CLI.
     *
     * @param _instance - Selected account; discovery does not inspect credentials.
     * @returns Native subscription, console and SSO browser procedures.
     *
     * @public
     */
    public override methods(_instance: IAiInstance): readonly IAiAuthMethod[] {
        void _instance;

        return [
            { id: 'subscription', label: 'Claude subscription', kind: 'browser' },
            { id: 'console', label: 'Anthropic Console', kind: 'browser' },
            { id: 'sso', label: 'Claude SSO', kind: 'browser' },
        ];
    }

    /**
     * Verifies the selected native profile without login, inference or MCP sessions.
     *
     * @param instance - Isolated configuration and secure-storage identity.
     * @param signal - Inspection cancellation.
     * @returns Safe native account metadata.
     * @throws An AiError for malformed native status or process failure.
     *
     * @public
     */
    public override async status(
        instance: IAiInstance,
        signal: AbortSignal,
    ): Promise<IAiAuthStatus> {
        const result = await this._runner.run({
            executable: instance.executable ?? 'claude',
            args: ['auth', 'status', '--json'],
            workingDirectory: instance.profile.paths.home,
            environment: await createClaudeEnvironment(instance),
            signal,
            timeoutMs: 15_000,
            maxOutputBytes: 65_536,
        });
        let parsed: unknown;

        try {
            parsed = JSON.parse(result.stdout);
        } catch {
            if (result.exitCode !== 0) throw claudeFailure(result.stderr);

            throw new AiError('protocol', 'Claude returned invalid authentication status.');
        }

        const status = record(parsed);

        if (!status || typeof status['loggedIn'] !== 'boolean')
            throw new AiError('protocol', 'Claude returned invalid authentication status.');

        const accountId = safeField(status['email']) ?? safeField(status['orgId']);
        const displayName = safeField(status['email']) ?? safeField(status['orgName']);
        const plan = safeField(status['subscriptionType']);
        const method =
            status['loggedIn'] && status['authMethod'] === 'claude.ai'
                ? 'subscription'
                : status['loggedIn'] && status['authMethod'] === 'api_key'
                  ? 'api-key'
                  : undefined;

        return {
            authenticated: status['loggedIn'],
            ...(method ? { method } : {}),
            ...(accountId ? { accountId } : {}),
            ...(displayName ? { displayName } : {}),
            ...(plan ? { plan } : {}),
            message: status['loggedIn']
                ? 'Claude authentication is available.'
                : 'Claude is not authenticated.',
        };
    }

    /**
     * Runs one explicitly selected native browser procedure with optional manual-code input.
     *
     * @param context - Isolated expiring auth operation and correlated host interaction owner.
     * @returns Completion of native login; the auth manager performs final verification.
     * @throws An AiError for unsupported methods, invalid responses or native rejection.
     *
     * @public
     */
    public override async login(context: IAiAuthContext): Promise<void> {
        if (!this.methods(context.instance).some((method) => method.id === context.methodId))
            throw new AiError('unsupported', 'Claude does not support this authentication method.');

        const args = [
            'auth',
            'login',
            ...(context.methodId === 'console' ? ['--console'] : ['--claudeai']),
            ...(context.methodId === 'sso' ? ['--sso'] : []),
        ];
        let process: IInteractiveProcess | undefined;
        let output = '';
        let shown = false;
        let completed = false;
        let responseFailure: unknown;
        const inspect = (chunk: string): void => {
            output = stripVTControlCharacters((output + chunk).slice(-65_536));

            if (shown) return;

            const url = (output.match(/https:\/\/[^\s<>"']+(?=[\s<>"'])/gu) ?? []).find(
                (candidate) => {
                    try {
                        const parsed = new URL(candidate);

                        return (
                            parsed.protocol === 'https:' &&
                            [
                                'claude.com',
                                'claude.ai',
                                'console.anthropic.com',
                                'platform.claude.com',
                                'platform.anthropic.com',
                            ].includes(parsed.hostname) &&
                            /\/oauth\/authorize/u.test(parsed.pathname)
                        );
                    } catch {
                        return false;
                    }
                },
            );

            if (!url) return;

            shown = true;

            const id = randomUUID();

            context.interaction({
                id,
                type: 'browser',
                expiresAt: Date.now() + 600_000,
                url,
                message:
                    'Complete native Claude sign-in; enter a code only if the native procedure requests it.',
                fields: [
                    {
                        id: 'authorizationCode',
                        label: 'Authorization code',
                        secret: true,
                        required: false,
                    },
                ],
            });
            void context
                .response(id)
                .then((values) => {
                    if (completed || context.signal.aborted) return;

                    const code = values['authorizationCode']?.trim();

                    if (!code) return;

                    if (code.length > 4_096 || /[\r\n\0]/u.test(code))
                        throw new AiError('configuration', 'Claude authorization code is invalid.');

                    if (!process) throw new AiError('host', 'Claude login input is unavailable.');

                    process.write(`${code}\n`);
                    process.end();
                })
                .catch((cause: unknown) => {
                    if (completed || context.signal.aborted) return;

                    responseFailure = cause;

                    if (process) void process.stop().catch(() => undefined);
                });
        };
        let result: IProcessResult;

        try {
            result = await this._runner.run({
                executable: context.instance.executable ?? 'claude',
                args,
                environment: await createClaudeEnvironment(context.instance),
                workingDirectory: context.instance.profile.paths.home,
                keepInputOpen: true,
                signal: context.signal,
                timeoutMs: 600_000,
                maxOutputBytes: 262_144,
                onStart: (control) => {
                    process = control;
                },
                onStdout: inspect,
                onStderr: inspect,
            });
        } catch (cause) {
            if (isCleanupIncomplete(cause)) throw cause;

            if (responseFailure) throw responseFailure;

            throw cause;
        } finally {
            completed = true;
        }

        if (responseFailure) throw responseFailure;

        if (result.exitCode !== 0) throw claudeFailure(result.stderr);
    }

    /**
     * Signs out only the selected native configuration/keychain service.
     *
     * @param instance - Isolated account configuration and secure-storage identity.
     * @param signal - Logout cancellation controlled by the shared auth owner.
     * @returns Native logout completion after owned subprocess cleanup.
     * @throws An AiError when the native command fails.
     *
     * @public
     */
    public override async logout(instance: IAiInstance, signal: AbortSignal): Promise<void> {
        const result = await this._runner.run({
            executable: instance.executable ?? 'claude',
            args: ['auth', 'logout'],
            workingDirectory: instance.profile.paths.home,
            environment: await createClaudeEnvironment(instance),
            signal,
            timeoutMs: 30_000,
            maxOutputBytes: 65_536,
        });

        if (result.exitCode !== 0) throw claudeFailure(result.stderr);
    }

    // #endregion
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function safeField(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;

    if (typeof value !== 'string')
        throw new AiError('protocol', 'Claude returned invalid account metadata.');

    return value.trim() ? boundedText(value, 512) : undefined;
}
