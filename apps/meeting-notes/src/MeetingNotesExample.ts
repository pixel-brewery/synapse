// #region Imports

import { AuthManager, ProfileManager, type IAuthHandle } from '@pixel-brewery/synapse-auth';
import { AiError, type AiDriverBase, type IAiInstance } from '@pixel-brewery/synapse-core';
import { ClaudeDriver } from '@pixel-brewery/synapse-provider-claude';
import { CodexDriver } from '@pixel-brewery/synapse-provider-codex';
import { OpenCodeDriver } from '@pixel-brewery/synapse-provider-opencode';
import {
    AiRuntime,
    NodeProcessRunner,
    ProfileAccessCoordinator,
} from '@pixel-brewery/synapse-runtime';
import { SimulatedDriver } from '@pixel-brewery/synapse-testing';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IMeetingNotes } from './interfaces/IMeetingNotes.js';
import type { IMeetingNotesIo } from './interfaces/IMeetingNotesIo.js';
import { parseMeetingNotes } from './parseMeetingNotes.js';

// #endregion

/**
 * Independent text-only consumer; recording, audio transcription and product UI are outside its scope.
 *
 * @internal
 */
export class MeetingNotesExample {
    // #region Ctor

    /**
     * Creates a thin consumer with explicit presentation/input dependencies.
     *
     * @param _io - Host CLI output, native-login presentation and protected user input.
     *
     * @internal
     */
    public constructor(private readonly _io: IMeetingNotesIo) {}

    // #endregion

    // #region Methods

    /**
     * Converts a synthetic transcript through an explicit real provider or an explicitly selected simulation.
     *
     * @param arguments_ - CLI options; --simulate or --provider is required, --login is opt-in.
     * @param signal - Host cancellation, including process interruption.
     * @returns Completion after rendering validated JSON and draining all owned processes.
     * @throws An AiError for invalid CLI options, login, provider or result-validation failure.
     *
     * @internal
     */
    public async run(arguments_: readonly string[], signal: AbortSignal): Promise<void> {
        const options = parseOptions(arguments_);
        const simulate = options.has('simulate');
        const provider = options.get('provider');

        if (
            (simulate && provider) ||
            (!simulate && !['codex', 'claude', 'opencode'].includes(provider ?? ''))
        )
            throw new AiError(
                'configuration',
                'Choose --simulate or --provider codex|claude|opencode.',
            );

        if (simulate && options.has('login'))
            throw new AiError('configuration', '--login requires a real selected provider.');

        const runner = new NodeProcessRunner();
        const access = new ProfileAccessCoordinator();
        const auth = new AuthManager(access);
        const fixture = {
            summary: 'The team agreed to prepare a Friday release after testing.',
            decisions: ['Target the release for Friday after tests pass.'],
            tasks: [
                { description: 'Run the release tests on Thursday.', owner: 'Mira' },
                { description: 'Prepare the release announcement.', owner: 'Alex' },
            ],
        };
        const driver: AiDriverBase = simulate
            ? new SimulatedDriver({
                  result: { text: JSON.stringify(fixture), structured: fixture },
              })
            : provider === 'codex'
              ? new CodexDriver(runner)
              : provider === 'claude'
                ? new ClaudeDriver(runner)
                : new OpenCodeDriver(runner);
        const manager = new ProfileManager({
            rootDirectory: resolve(
                options.get('profile-root') ??
                    join(homedir(), '.local', 'share', 'synapse-meeting-notes'),
            ),
        });
        const profile = await manager.create({
            applicationId: 'synapse-meeting-notes-example',
            accountId: options.get('account') ?? 'default',
            driverId: driver.id,
        });
        const instance: IAiInstance = {
            id: 'meeting-account',
            driverId: driver.id,
            profile,
            ...(provider === 'opencode'
                ? {
                      configuration: {
                          providerId:
                              options.get('opencode-provider') ??
                              options.get('model')?.split('/')[0] ??
                              'openai',
                          ...(options.get('opencode-method')
                              ? { authMethod: options.get('opencode-method') }
                              : {}),
                      },
                  }
                : {}),
        };
        const runtime = new AiRuntime({ drivers: [driver], instances: [instance], access });
        let outcome:
            | { readonly succeeded: true; readonly notes: IMeetingNotes }
            | { readonly succeeded: false; readonly cause: unknown };

        try {
            if (simulate)
                this._io.diagnostic(
                    'Simulation selected explicitly: no AI inference is performed.',
                );

            if (options.has('login'))
                await this.login(instance, driver, auth, options.get('method'), signal);

            const schema = {
                type: 'object',
                additionalProperties: false,
                required: ['summary', 'decisions', 'tasks'],
                properties: {
                    summary: { type: 'string', minLength: 1 },
                    decisions: { type: 'array', items: { type: 'string' } },
                    tasks: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['description', 'owner'],
                            properties: {
                                description: { type: 'string', minLength: 1 },
                                owner: { type: ['string', 'null'] },
                            },
                        },
                    },
                },
            };
            const transcript =
                'Alex: We will target Friday for the release, provided the tests pass.\nMira: I will run the release tests on Thursday.\nAlex: I will prepare the release announcement.\nMira: Agreed.';
            const result = await runtime.run({
                target: { instanceId: instance.id },
                prompt: `Create accurate meeting notes from this synthetic transcript. Return only a JSON object with summary, decisions and tasks. Never invent decisions or owners. Each task has description and owner; use null when no owner was explicitly stated.\n\n${transcript}`,
                policy: { mode: 'read-only' },
                outputSchema: schema,
                ...(options.get('model') ? { model: options.get('model') } : {}),
                signal,
            }).result;

            outcome = { succeeded: true, notes: parseMeetingNotes(result.structured) };
        } catch (cause) {
            outcome = { succeeded: false, cause };
        }

        const stopped = await Promise.allSettled([
            auth.dispose(),
            runtime.dispose(),
            runner.dispose(),
        ]);

        if (!outcome.succeeded) throw outcome.cause;

        if (stopped.some((result) => result.status === 'rejected'))
            throw new AiError(
                'host',
                'The meeting example could not finish owned process cleanup.',
            );

        this._io.output(JSON.stringify(outcome.notes, null, 2));
    }

    private async login(
        instance: IAiInstance,
        driver: AiDriverBase,
        auth: AuthManager,
        methodId: string | undefined,
        signal: AbortSignal,
    ): Promise<void> {
        if (!driver.auth)
            throw new AiError('unsupported', 'The selected driver exposes no native login.');

        const methods = driver.auth.methods(instance);
        const method = methodId
            ? methods.find((entry) => entry.id === methodId)
            : methods.find((entry) => ['browser', 'device-code', 'terminal'].includes(entry.kind));

        if (!method)
            throw new AiError(
                'unsupported',
                'No native subscription login is configured. For OpenCode, supply the exact --opencode-method label.',
            );

        const handle = auth.start(instance, driver.auth, {
            ownerId: 'meeting-notes-cli',
            methodId: method.id,
            signal,
        });
        const input = new AbortController();

        void handle.result.finally(() => input.abort()).catch(() => undefined);

        try {
            for await (const state of handle.events) {
                if (state.state !== 'waiting') continue;

                const interaction = state.interaction;

                if (interaction.message) this._io.diagnostic(interaction.message);

                if (interaction.url) this._io.diagnostic(interaction.url);

                if (interaction.code) this._io.diagnostic(`Verification code: ${interaction.code}`);

                if (!interaction.fields?.length) continue;

                const values: Record<string, string> = {};

                try {
                    for (const field of interaction.fields)
                        values[field.id] = await this._io.input(
                            field.label,
                            field.secret,
                            input.signal,
                        );
                } catch (cause) {
                    if (input.signal.aborted) break;

                    throw cause;
                }

                this.respond(handle, state.operationId, interaction.id, values);
            }

            await handle.result;
        } catch (cause) {
            await handle.cancel();

            throw cause;
        } finally {
            input.abort();
        }
    }

    private respond(
        handle: IAuthHandle,
        operationId: string,
        interactionId: string,
        values: Readonly<Record<string, string>>,
    ): void {
        if (handle.state.state !== 'waiting' || handle.state.interaction.id !== interactionId)
            return;

        handle.respond({ ownerId: 'meeting-notes-cli', operationId, interactionId, values });
    }

    // #endregion
}

function parseOptions(values: readonly string[]): ReadonlyMap<string, string> {
    const flags = new Set(['simulate', 'login']);
    const names = new Set([
        'provider',
        'profile-root',
        'account',
        'model',
        'method',
        'opencode-provider',
        'opencode-method',
    ]);
    const result = new Map<string, string>();

    for (let index = 0; index < values.length; index++) {
        const value = values[index];

        if (!value?.startsWith('--'))
            throw new AiError('configuration', 'Meeting example options must use named flags.');

        const name = value.slice(2);

        if (result.has(name))
            throw new AiError('configuration', 'Duplicate meeting example option.');

        if (flags.has(name)) {
            result.set(name, 'true');

            continue;
        }

        const argument = values[++index];

        if (!names.has(name) || !argument || argument.startsWith('--'))
            throw new AiError('configuration', 'Unknown or incomplete meeting example option.');

        result.set(name, argument);
    }

    return result;
}
