// #region Imports

import { AuthManager, ProfileManager } from '@pixel-brewery/synapse-auth';
import { AiError, isCleanupIncomplete } from '@pixel-brewery/synapse-core';
import { ClaudeDriver } from '@pixel-brewery/synapse-provider-claude';
import { CodexDriver } from '@pixel-brewery/synapse-provider-codex';
import { OpenCodeDriver } from '@pixel-brewery/synapse-provider-opencode';
import {
    AiRuntime,
    NodeProcessRunner,
    ProcessRunnerBase,
    ProfileAccessCoordinator,
} from '@pixel-brewery/synapse-runtime';
import { randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// #endregion

const applicationId = 'synapse-meeting-notes-example';
const providers = new Set(['codex', 'claude', 'opencode']);
const runTimeoutMs = 120_000;
const totalTimeoutMs = 600_000;
const nonceSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['nonce', 'acknowledged'],
    properties: {
        nonce: { type: 'string', minLength: 1, maxLength: 128 },
        acknowledged: { const: true },
    },
};

/**
 * Requires an explicitly selected native CLI and dedicated account/profile store.
 *
 * @param arguments_ - CLI arguments without the executable or script path.
 * @returns Validated immutable options; no profile or provider is accessed here.
 * @throws An AiError for missing, duplicate, unknown or unsafe options.
 *
 * @internal
 */
export function parseNativeOptions(arguments_) {
    const names = new Set([
        'provider',
        'profile-root',
        'account',
        'application-id',
        'model',
        'opencode-provider',
    ]);
    const values = new Map();

    for (let index = 0; index < arguments_.length; index++) {
        const argument = arguments_[index];

        if (typeof argument !== 'string' || !argument.startsWith('--'))
            throw new AiError('configuration', 'Native verification requires named CLI options.');

        const name = argument.slice(2);

        if (values.has(name))
            throw new AiError('configuration', 'Duplicate native verification option.');

        if (name === 'logout') {
            values.set(name, true);

            continue;
        }

        const value = arguments_[++index];

        if (
            !names.has(name) ||
            typeof value !== 'string' ||
            !value.trim() ||
            value.startsWith('--') ||
            value.includes('\0')
        )
            throw new AiError('configuration', 'Unknown or incomplete native verification option.');

        values.set(name, value);
    }

    if (
        !providers.has(values.get('provider')) ||
        !values.get('profile-root') ||
        !isAbsolute(values.get('profile-root')) ||
        !values.get('account')
    )
        throw new AiError(
            'configuration',
            'Supply --provider codex|claude|opencode, an absolute --profile-root and a dedicated test --account.',
        );

    const selectedApplication = values.get('application-id') ?? applicationId;

    if (selectedApplication.length > 96 || values.get('account').length > 96)
        throw new AiError(
            'configuration',
            'Test application/account identifiers exceed 96 characters.',
        );

    if (values.has('opencode-provider') && values.get('provider') !== 'opencode')
        throw new AiError('configuration', '--opencode-provider requires --provider opencode.');

    return Object.freeze({
        provider: values.get('provider'),
        profileRoot: resolve(values.get('profile-root')),
        account: values.get('account'),
        applicationId: selectedApplication,
        model: values.get('model'),
        openCodeProvider: values.get('opencode-provider'),
        logout: values.get('logout') === true,
    });
}

/**
 * Verifies actual account, schema, continuation, cancellation and profile ownership through one runtime.
 *
 * @param options - Options from parseNativeOptions; login must already have been completed explicitly.
 * @param dependencies - Internal test seams for a controlled driver/transport, host cancellation and safe step reporting. The CLI never substitutes a driver.
 * @returns Safe completed-check evidence after every owned resource has been disposed.
 * @throws An AiError on any failed check, missing authentication, cancellation or cleanup uncertainty; checks are never silently skipped.
 * @remarks Native runs may consume subscription quota. The resume prompt and schema deliberately omit the synthetic nonce. Credentials, raw native messages and native session references are not returned in the report.
 *
 * @internal
 */
export async function verifyNativeProvider(options, dependencies = {}) {
    const runner = dependencies.runner ?? new NodeProcessRunner();
    let activeNativeCalls = 0;
    const observedRunner = new (class extends ProcessRunnerBase {
        // #region Methods

        /**
         * Observes an outstanding native transport operation without changing its behavior.
         *
         * @param request - The actual driver's process request.
         * @returns The underlying bounded process result after cleanup.
         *
         * @internal
         */
        async run(request) {
            activeNativeCalls++;

            try {
                return await runner.run(request);
            } finally {
                activeNativeCalls--;
            }
        }

        /**
         * Drains the underlying owned native transport.
         *
         * @returns Completion after native cleanup.
         *
         * @internal
         */
        async dispose() {
            await runner.dispose();
        }

        // #endregion
    })();
    const access = new ProfileAccessCoordinator();
    const auth = new AuthManager(access, { statusTimeoutMs: 10_000 });
    const controller = new AbortController();
    const externalAbort = () =>
        controller.abort(
            dependencies.signal?.reason ??
                new AiError('cancelled', 'Native verification cancelled.'),
        );

    dependencies.signal?.addEventListener('abort', externalAbort, { once: true });

    if (dependencies.signal?.aborted) externalAbort();

    const deadline = Date.now() + totalTimeoutMs;
    const timer = setTimeout(
        () => controller.abort(new AiError('timeout', 'Native verification exceeded ten minutes.')),
        totalTimeoutMs,
    );
    const checks = [];
    const passed = (name) => {
        checks.push(name);
        dependencies.onStep?.(name);
    };
    let runtime;
    let failure;

    try {
        controller.signal.throwIfAborted();

        const driver = dependencies.createDriver
            ? dependencies.createDriver(observedRunner, options)
            : createDriver(observedRunner, options.provider);

        if (driver.id !== options.provider || !driver.auth)
            throw new AiError(
                'configuration',
                'The selected native driver must expose its own authentication adapter.',
            );

        const profiles = new ProfileManager({ rootDirectory: options.profileRoot });
        const primary = makeInstance(
            'meeting-account',
            await profiles.create({
                applicationId: options.applicationId,
                accountId: options.account,
                driverId: driver.id,
            }),
            options,
        );
        const secondary = makeInstance(
            'native-verification-isolation',
            await profiles.create({
                applicationId: `${options.applicationId}-isolation`,
                accountId: `${options.account}-isolation`,
                driverId: driver.id,
            }),
            options,
        );

        runtime = new AiRuntime({
            drivers: [driver],
            instances: [primary, secondary],
            access,
            defaultTimeoutMs: runTimeoutMs,
            eventCapacity: 32,
        });

        const status = await auth.status(primary, driver.auth, controller.signal);

        if (!status.authenticated)
            throw new AiError(
                'auth-required',
                'Sign in explicitly with the meeting CLI --login using this provider, profile root and account before native verification.',
            );

        passed('auth-status');

        const request = {
            target: { instanceId: primary.id },
            policy: { mode: 'read-only', repeatable: false },
            workingDirectory: primary.profile.paths.execution,
            ...(options.model ? { model: options.model } : {}),
            signal: controller.signal,
        };
        const execute = (changes) =>
            runtime.run({
                ...request,
                ...changes,
                deadline: Math.min(deadline, Date.now() + runTimeoutMs),
            }).result;
        const nonce = randomUUID();
        const initial = await execute({
            prompt: `Read-only session verification. Do not use tools or change files. Remember this synthetic value for the next turn. VERIFICATION_NONCE: ${nonce}\nReturn only JSON with nonce equal to that value and acknowledged true.`,
            outputSchema: nonceSchema,
        });

        assertNonce(initial.structured, nonce);
        assertSession(initial.session, primary);
        passed('schema-json');

        const resumed = await execute({
            prompt: 'Continue the preceding verification conversation. Return only JSON containing the previously remembered verification nonce and acknowledged true. Retrieve the exact value from the preceding turn; do not invent or replace it. Do not use tools or change files.',
            outputSchema: nonceSchema,
            session: initial.session,
        });

        assertNonce(resumed.structured, initial.structured.nonce);
        assertSession(resumed.session, primary);
        passed('bound-resume');

        await verifyCancellation(execute, controller.signal, () => activeNativeCalls > 0);
        passed('active-cancellation');

        await execute({
            prompt: 'Read-only recovery verification. Do not use tools or change files. Return only JSON with ok set to true.',
            outputSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['ok'],
                properties: { ok: { const: true } },
            },
        });
        passed('reuse-after-cancellation');

        const isolated = await auth.status(secondary, driver.auth, controller.signal);

        if (isolated.authenticated || primary.profile.id === secondary.profile.id)
            throw new AiError(
                'host',
                'The separate application/account unexpectedly shares an authenticated profile.',
            );

        passed('profile-isolation');

        try {
            await execute({
                target: { instanceId: secondary.id },
                prompt: 'This foreign native session must be rejected before provider execution.',
                session: initial.session,
            });
        } catch (cause) {
            if (!(cause instanceof AiError) || cause.code !== 'session-unavailable') throw cause;

            passed('foreign-session-rejected');
        }

        if (!checks.includes('foreign-session-rejected'))
            throw new AiError('host', 'The runtime accepted a foreign profile session.');

        if (options.logout) {
            await auth.logout(primary, driver.auth, controller.signal);

            if ((await auth.status(primary, driver.auth, controller.signal)).authenticated)
                throw new AiError(
                    'provider',
                    'The explicitly requested native logout was not verified.',
                );

            passed('logout-verified');
        }

        return {
            provider: options.provider,
            applicationId: options.applicationId,
            account: options.account,
            platform: process.platform,
            nodeVersion: process.versions.node,
            completedAt: new Date().toISOString(),
            checks,
            logoutRequested: options.logout,
        };
    } catch (cause) {
        failure = cause;

        throw cause;
    } finally {
        try {
            const cleanup = await Promise.allSettled([
                auth.dispose(),
                runtime?.dispose(),
                runner.dispose(),
            ]);
            const causes = cleanup
                .filter((result) => result.status === 'rejected')
                .map((result) => result.reason);

            if (causes.length)
                throw new AiError('host', 'Native verification could not finish owned cleanup.', {
                    cause: new AggregateError(failure ? [failure, ...causes] : causes),
                    cleanupIncomplete: causes.some(isCleanupIncomplete),
                });
        } finally {
            clearTimeout(timer);
            dependencies.signal?.removeEventListener('abort', externalAbort);
        }
    }
}

function createDriver(runner, provider) {
    if (provider === 'codex') return new CodexDriver(runner);

    if (provider === 'claude') return new ClaudeDriver(runner);

    if (provider === 'opencode') return new OpenCodeDriver(runner);

    throw new AiError('configuration', 'A native provider must be selected explicitly.');
}

function makeInstance(id, profile, options) {
    return {
        id,
        driverId: options.provider,
        profile,
        ...(options.provider === 'opencode'
            ? {
                  configuration: {
                      providerId:
                          options.openCodeProvider ?? options.model?.split('/')[0] ?? 'openai',
                  },
              }
            : {}),
    };
}

function assertNonce(structured, expected) {
    if (structured?.nonce !== expected || structured.acknowledged !== true)
        throw new AiError(
            'result-validation',
            'The native response did not retain the exact verification nonce.',
        );
}

function assertSession(session, instance) {
    if (
        !session?.nativeId ||
        session.driverId !== instance.driverId ||
        session.profileId !== instance.profile.id ||
        session.instanceId !== instance.id ||
        session.candidateId !== instance.id ||
        !session.authenticationGeneration
    )
        throw new AiError(
            'protocol',
            'The native run did not return a complete bound session reference.',
        );
}

async function verifyCancellation(execute, signal, isNativeActive) {
    const controller = new AbortController();
    let observedNativeProgress = false;

    try {
        await execute({
            prompt: 'Cancellation verification. Give a long, detailed read-only explanation of how immutable data structures work, using at least 5000 words. Do not use tools or change files.',
            signal: AbortSignal.any([signal, controller.signal]),
            onEvent: async (event) => {
                if (
                    !observedNativeProgress &&
                    isNativeActive() &&
                    ['session', 'progress', 'text'].includes(event.type)
                ) {
                    observedNativeProgress = true;
                    queueMicrotask(() => controller.abort());
                }
            },
        });
    } catch (cause) {
        if (isCleanupIncomplete(cause)) throw cause;

        signal.throwIfAborted();

        if (
            observedNativeProgress &&
            controller.signal.aborted &&
            cause instanceof AiError &&
            cause.code === 'cancelled' &&
            !isCleanupIncomplete(cause)
        )
            return;

        throw cause;
    }

    throw new AiError(
        'host',
        'The native cancellation probe completed without a confirmed active cancellation.',
    );
}

/**
 * Starts native verification only after explicit CLI invocation and validated arguments.
 *
 * @param arguments_ - Required provider/profile/account flags and optional model/logout.
 * @returns Completion after printing safe JSON evidence or propagating failure.
 * @throws An AiError on invalid options or any incomplete verification.
 *
 * @internal
 */
export async function main(arguments_) {
    if (arguments_.length === 1 && ['--help', '-h'].includes(arguments_[0])) {
        process.stdout.write(
            'Usage: yarn native:verify --provider codex|claude|opencode --profile-root <absolute dedicated directory> --account <test account> [--model <native model>] [--opencode-provider <provider>] [--application-id <owner>] [--logout]\n\nComplete explicit login with the meeting-text example first. This command performs real inference and does not initiate login or simulate results.\nSee .docs/guides/native-verification.md for preparation and platform commands.\n',
        );

        return;
    }

    const options = parseNativeOptions(arguments_);
    const controller = new AbortController();
    const interrupt = () =>
        controller.abort(new AiError('cancelled', 'Native verification was interrupted.'));

    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);

    try {
        const report = await verifyNativeProvider(options, {
            signal: controller.signal,
            onStep: (name) => process.stderr.write(`Passed: ${name}\n`),
        });

        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } finally {
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', interrupt);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await main(process.argv.slice(2));
    } catch (cause) {
        process.stderr.write(
            `${cause instanceof AiError ? cause.message : 'Native verification failed.'}\n`,
        );
        process.exitCode = 1;
    }
}
