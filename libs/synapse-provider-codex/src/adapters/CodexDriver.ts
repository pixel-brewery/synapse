// #region Imports

import {
    AiDriverBase,
    AiError,
    isCleanupIncomplete,
    type IAiCapabilities,
    type IAiDriverResult,
    type IAiExecutionContext,
    type IAiInstance,
} from '@pixel-brewery/synapse-core';
import { JsonLineDecoder, type ProcessRunnerBase } from '@pixel-brewery/synapse-runtime';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CodexAuthDriver } from '../auth/CodexAuthDriver.js';
import { CodexEventDecoder } from '../protocol/CodexEventDecoder.js';
import { codexExecutionArguments } from '../protocol/codexExecutionArguments.js';
import { codexProjectMcpServers } from '../profile/codexProjectMcpServers.js';
import { prepareCodexCredentials } from '../profile/prepareCodexCredentials.js';
import { commitCodexCredentials } from '../profile/commitCodexCredentials.js';
import { createCodexEnvironment } from '../profile/createCodexEnvironment.js';
import { CodexMetadataInspector } from '../metadata/CodexMetadataInspector.js';
import type { ICodexInspection } from '../interfaces/ICodexInspection.js';

// #endregion

/**
 * Native Codex exec/JSONL adapter with isolated credentials and legacy-compatible sessions.
 *
 * @remarks Constructing this driver performs no discovery, authentication or process work.
 *
 * @public
 */
export class CodexDriver extends AiDriverBase {
    // #region Fields

    /**
     * Open driver identity used for explicit runtime registration.
     *
     * @public
     */
    public override readonly id: string = 'codex';

    /**
     * Native sandbox, resume and schema capabilities enforced by this adapter.
     *
     * @public
     */
    public override readonly capabilities: IAiCapabilities = {
        modes: ['read-only', 'workspace-write'],
        resume: true,
        structuredOutput: 'native',
        tools: true,
    };

    /**
     * Native account procedures sharing the driver's subprocess owner.
     *
     * @public
     */
    public override readonly auth: CodexAuthDriver;

    private readonly _profileTails = new Map<string, Promise<void>>();
    private readonly _metadata: CodexMetadataInspector;
    private _disposed = false;

    // #endregion

    // #region Ctor

    /**
     * Creates an explicitly composed native driver without startup effects.
     *
     * @param _runner - Dedicated owned subprocess runner; dispose releases its processes.
     *
     * @public
     */
    public constructor(private readonly _runner: ProcessRunnerBase) {
        super();
        this.auth = new CodexAuthDriver(_runner);
        this._metadata = new CodexMetadataInspector(_runner);
    }

    // #endregion

    // #region Methods

    /**
     * Executes one turn through native Codex exec; prompts never enter argv.
     *
     * @param context - Isolated authorized request and critical event callback.
     * @returns Final text, session and usage from this same native turn.
     * @throws An AiError for unsupported policy, native/protocol failure or credential persistence failure.
     * @remarks Same-profile turns serialize credential snapshots and native token refresh commits. Different profiles remain independent. Unconfirmed native process cleanup blocks credential refresh commits.
     *
     * @public
     */
    public override async execute(context: IAiExecutionContext): Promise<IAiDriverResult> {
        if (!this.capabilities.modes.includes(context.request.policy.mode))
            throw new AiError('unsupported', 'Codex cannot enforce the requested execution mode.');

        // Validate deterministic policy before any filesystem preparation.
        codexExecutionArguments(context, []);

        return this.withProfile(context.instance.profile.id, context.signal, async () => {
            if (context.request.deadline !== undefined && context.request.deadline <= Date.now())
                throw new AiError('timeout', 'The Codex deadline expired before launch.');

            let snapshot;

            try {
                snapshot = await prepareCodexCredentials(context.instance);
            } catch (cause) {
                if (cause instanceof AiError) throw cause;

                throw new AiError('host', 'Could not prepare Codex execution credentials.', {
                    cause,
                });
            }

            let schemaDirectory: string | undefined;
            let outcome: { readonly result: IAiDriverResult } | { readonly failure: unknown };

            try {
                let schemaFile: string | undefined;

                if (context.request.outputSchema) {
                    try {
                        await mkdir(context.instance.profile.paths.temporary, {
                            recursive: true,
                            mode: 0o700,
                        });
                        schemaDirectory = await mkdtemp(
                            join(context.instance.profile.paths.temporary, 'schema-'),
                        );
                        schemaFile = join(schemaDirectory, 'output.json');
                        await writeFile(schemaFile, JSON.stringify(context.request.outputSchema), {
                            mode: 0o600,
                        });
                    } catch (cause) {
                        throw new AiError(
                            'host',
                            'Could not prepare native Codex structured output.',
                            {
                                cause,
                            },
                        );
                    }
                }

                const decoder = new CodexEventDecoder(context);
                const lines = new JsonLineDecoder((value: unknown) => decoder.accept(value));
                const result = await this._runner.run({
                    executable: context.instance.executable ?? 'codex',
                    args: codexExecutionArguments(
                        context,
                        await codexProjectMcpServers(context.workingDirectory),
                        schemaFile,
                    ),
                    workingDirectory: context.workingDirectory,
                    environment: await createCodexEnvironment(context.instance, snapshot.home),
                    input: context.request.prompt,
                    signal: context.signal,
                    timeoutMs: Math.min(
                        2_147_483_647,
                        Math.max(
                            1,
                            (context.request.deadline ?? Date.now() + 300_000) - Date.now(),
                        ),
                    ),
                    maxOutputBytes: 4_194_304,
                    onStdout: (chunk) => lines.push(chunk),
                });

                await lines.finish();
                outcome = { result: decoder.complete(result.exitCode, result.stderr) };
            } catch (cause) {
                outcome = { failure: cause };
            }

            const cleanupIncomplete = 'failure' in outcome && isCleanupIncomplete(outcome.failure);

            try {
                try {
                    if (!cleanupIncomplete) await commitCodexCredentials(snapshot);
                } finally {
                    if (schemaDirectory) {
                        await this.cleanSchemaDirectory(schemaDirectory);
                    }
                }
            } catch (cause) {
                // Preserve the failure that keeps authentication blocked after unconfirmed process cleanup.
                if (!cleanupIncomplete) throw cause;
            }

            if ('failure' in outcome) throw outcome.failure;

            return outcome.result;
        });
    }

    /**
     * Inspects metadata through a separate credential-only native home, without agent startup.
     *
     * @param instance - Selected isolated account and explicit native paths.
     * @param signal - Bounded inspection cancellation.
     * @returns Native models, account limits and safe optional usage details.
     * @throws An AiError for model/protocol or host persistence failure.
     * @remarks Unconfirmed native process cleanup blocks credential refresh commits.
     *
     * @public
     */
    public override async inspect(
        instance: IAiInstance,
        signal: AbortSignal,
    ): Promise<ICodexInspection> {
        return this.withProfile(instance.profile.id, signal, async () => {
            const auth = await this.auth.status(instance, signal);
            const snapshot = await prepareCodexCredentials(instance, true);
            let primaryFailure: unknown;

            try {
                const metadata = await this._metadata.inspect(instance, snapshot, signal);

                return {
                    ...metadata,
                    auth: metadata.usage?.planType
                        ? { ...auth, plan: metadata.usage.planType }
                        : auth,
                };
            } catch (cause) {
                primaryFailure = cause;

                throw cause;
            } finally {
                if (!isCleanupIncomplete(primaryFailure)) await commitCodexCredentials(snapshot);
            }
        });
    }

    /**
     * Stops owned native processes and awaits queued same-profile operations.
     *
     * @returns Completion once this driver's process and profile queues are drained.
     *
     * @public
     */
    public override async dispose(): Promise<void> {
        this._disposed = true;
        await this._runner.dispose();
        await Promise.all(this._profileTails.values());
    }

    private async cleanSchemaDirectory(directory: string): Promise<void> {
        try {
            await rm(directory, { recursive: true, force: true });
        } catch (cause) {
            throw new AiError('host', 'Could not clean up the Codex schema workspace.', { cause });
        }
    }

    private async withProfile<T>(
        id: string,
        signal: AbortSignal,
        operation: () => Promise<T>,
    ): Promise<T> {
        if (this._disposed) throw new AiError('disposed', 'Codex driver is disposed.');

        if (signal.aborted) throw aborted(signal);

        const previous = this._profileTails.get(id) ?? Promise.resolve();
        let release: () => void = () => undefined;
        const slot = new Promise<void>((resolve) => {
            release = resolve;
        });
        const tail = previous.then(() => slot);

        this._profileTails.set(id, tail);

        try {
            await new Promise<void>((resolve, reject) => {
                const cancel = (): void => {
                    signal.removeEventListener('abort', cancel);
                    reject(aborted(signal));
                };

                signal.addEventListener('abort', cancel, { once: true });
                previous.then(() => {
                    signal.removeEventListener('abort', cancel);
                    resolve();
                }, reject);

                if (signal.aborted) cancel();
            });

            if (this._disposed) throw new AiError('disposed', 'Codex driver is disposed.');

            if (signal.aborted) throw aborted(signal);

            return await operation();
        } finally {
            release();
            void tail.then(() => {
                if (this._profileTails.get(id) === tail) this._profileTails.delete(id);
            });
        }
    }

    // #endregion
}

function aborted(signal: AbortSignal): AiError {
    return signal.reason instanceof AiError
        ? signal.reason
        : new AiError('cancelled', 'Codex execution was cancelled.');
}
