// #region Imports

import {
    AiError,
    type IAiInstance,
    type IAiModel,
    type IAiLimit,
} from '@pixel-brewery/synapse-core';
import {
    JsonLineDecoder,
    type ProcessRunnerBase,
    type IInteractiveProcess,
} from '@pixel-brewery/synapse-runtime';
import type { ICodexCredentialSnapshot } from '../interfaces/ICodexCredentialSnapshot.js';
import type { ICodexInspection } from '../interfaces/ICodexInspection.js';
import type { ICodexAccountUsage } from '../interfaces/ICodexAccountUsage.js';
import type { ICodexUsageWindow } from '../interfaces/ICodexUsageWindow.js';
import type { ICodexCredits } from '../interfaces/ICodexCredits.js';
import type { ICodexTokenUsage } from '../interfaces/ICodexTokenUsage.js';
import { createCodexEnvironment } from '../profile/createCodexEnvironment.js';

// #endregion

/**
 * Bounded metadata-only app-server RPC client; it creates no agent threads or MCP sessions.
 *
 * @public
 */
export class CodexMetadataInspector {
    // #region Ctor

    /**
     * Creates an inert inspector over the owning driver's subprocess boundary.
     *
     * @param _runner - Subprocess execution and cleanup owner.
     *
     * @public
     */
    public constructor(private readonly _runner: ProcessRunnerBase) {}

    // #endregion

    // #region Methods

    /**
     * Reads native models and optional account usage through the existing app-server protocol.
     *
     * @param instance - Isolated account instance.
     * @param snapshot - Same-profile metadata-only native home.
     * @param signal - Caller cancellation, bounded independently of inference.
     * @returns Validated generic models and safe native usage details.
     * @throws An AiError for initialization, model/protocol, timeout or cleanup failure.
     *
     * @public
     */
    public async inspect(
        instance: IAiInstance,
        snapshot: ICodexCredentialSnapshot,
        signal: AbortSignal,
    ): Promise<Omit<ICodexInspection, 'auth'>> {
        let process: IInteractiveProcess | undefined;
        let stopping: Promise<void> | undefined;
        let initialized = false;
        let complete = false;
        const pending = new Set([2, 3, 4]);
        const cursors = new Set<string>();
        const models: IAiModel[] = [];
        const windows: ICodexUsageWindow[] = [];
        const warnings: ('rate-limits-unavailable' | 'usage-unavailable')[] = [];
        let planType: string | undefined;
        let credits: ICodexCredits | undefined;
        let tokenUsage: ICodexTokenUsage | undefined;
        const send = (value: unknown): void => {
            if (!process) throw new AiError('host', 'Codex metadata transport is unavailable.');

            process.write(`${JSON.stringify(value)}
`);
        };
        const finish = (): void => {
            if (pending.size || complete) return;

            complete = true;
            stopping = process!.stop();
            void stopping.catch(() => undefined);
        };
        const lines = new JsonLineDecoder(async (frame: unknown) => {
            const response = record(frame);

            if (!response || !('id' in response)) return;

            const id =
                typeof response['id'] === 'number'
                    ? response['id']
                    : typeof response['id'] === 'string'
                      ? Number(response['id'])
                      : Number.NaN;

            if (id === 1) {
                if (initialized) return;

                if (response['error'] || !record(response['result']))
                    throw new AiError('protocol', 'Codex metadata initialization failed.');

                initialized = true;
                send({ method: 'initialized' });
                send({ id: 2, method: 'model/list', params: { limit: 100, includeHidden: false } });
                send({ id: 3, method: 'account/rateLimits/read' });
                send({ id: 4, method: 'account/usage/read' });

                return;
            }

            if (!initialized || !pending.has(id)) return;

            if (response['error']) {
                if (id === 2)
                    throw new AiError('provider', 'Codex model metadata is unavailable.', {
                        retryable: true,
                    });

                warnings.push(id === 3 ? 'rate-limits-unavailable' : 'usage-unavailable');
                pending.delete(id);
                finish();

                return;
            }

            const result = record(response['result']);

            if (!result) throw new AiError('protocol', 'Codex returned invalid metadata.');

            if (id === 2) {
                if (!Array.isArray(result['data']))
                    throw new AiError('protocol', 'Codex returned an invalid model list.');

                for (const entry of result['data']) {
                    const model = record(entry);

                    if (!model || !text(model['model']))
                        throw new AiError('protocol', 'Codex returned an invalid model.');

                    if (model['hidden'] === true) continue;

                    if (model['hidden'] !== undefined && typeof model['hidden'] !== 'boolean')
                        throw new AiError('protocol', 'Codex returned invalid model visibility.');

                    const efforts = model['supportedReasoningEfforts'];

                    if (efforts !== undefined && !Array.isArray(efforts))
                        throw new AiError('protocol', 'Codex returned invalid reasoning metadata.');

                    const reasoning: string[] = [];
                    const descriptions: Record<string, string> = {};

                    for (const raw of efforts ?? []) {
                        const effort = record(raw);
                        const name = effort ? text(effort['reasoningEffort']) : undefined;

                        if (!name)
                            throw new AiError(
                                'protocol',
                                'Codex returned invalid reasoning metadata.',
                            );

                        reasoning.push(name);

                        const description = effort ? text(effort['description']) : undefined;

                        if (description) descriptions[name] = description;
                    }

                    const isDefault = model['isDefault'];

                    if (isDefault !== undefined && typeof isDefault !== 'boolean')
                        throw new AiError('protocol', 'Codex returned invalid model defaults.');

                    models.push({
                        id: text(model['model'])!,
                        ...(text(model['displayName']) ? { name: text(model['displayName']) } : {}),
                        ...(text(model['description'])
                            ? { description: text(model['description']) }
                            : {}),
                        ...(typeof isDefault === 'boolean' ? { isDefault } : {}),
                        ...(text(model['defaultReasoningEffort'])
                            ? { defaultReasoningEffort: text(model['defaultReasoningEffort']) }
                            : {}),
                        reasoningEfforts: reasoning,
                        reasoningDescriptions: descriptions,
                    });

                    if (models.length > 1_000)
                        throw new AiError(
                            'output-limit',
                            'Codex model metadata exceeds the supported bound.',
                        );
                }

                const next = result['nextCursor'];

                if (next !== null && next !== undefined && typeof next !== 'string')
                    throw new AiError('protocol', 'Codex returned an invalid model cursor.');

                if (typeof next === 'string' && next) {
                    if (next.length > 4_096 || cursors.has(next) || cursors.size >= 16)
                        throw new AiError('protocol', 'Codex model pagination did not terminate.');

                    cursors.add(next);
                    send({
                        id: 2,
                        method: 'model/list',
                        params: { limit: 100, includeHidden: false, cursor: next },
                    });

                    return;
                }
            } else if (id === 3) {
                const limits = record(result['rateLimits']);

                if (!limits)
                    throw new AiError('protocol', 'Codex returned invalid rate-limit metadata.');

                planType = text(limits['planType']);

                for (const key of ['primary', 'secondary']) {
                    const raw = limits[key];

                    if (raw === null || raw === undefined) continue;

                    const window = record(raw);

                    if (
                        !window ||
                        typeof window['usedPercent'] !== 'number' ||
                        !Number.isFinite(window['usedPercent'])
                    )
                        throw new AiError('protocol', 'Codex returned an invalid capacity window.');

                    const usedPercent = Math.min(100, Math.max(0, window['usedPercent']));
                    const duration = optionalNumber(window['windowDurationMins']);
                    const reset = optionalNumber(window['resetsAt']);

                    windows.push({
                        usedPercent,
                        remainingPercent: 100 - usedPercent,
                        ...(duration !== undefined ? { windowDurationMinutes: duration } : {}),
                        ...(reset !== undefined ? { resetsAt: reset * 1_000 } : {}),
                    });
                }

                const rawCredits = limits['credits'];

                if (rawCredits !== undefined && rawCredits !== null) {
                    const value = record(rawCredits);

                    if (
                        !value ||
                        typeof value['hasCredits'] !== 'boolean' ||
                        typeof value['unlimited'] !== 'boolean'
                    )
                        throw new AiError('protocol', 'Codex returned invalid credit metadata.');

                    if (
                        value['balance'] !== undefined &&
                        value['balance'] !== null &&
                        typeof value['balance'] !== 'string'
                    )
                        throw new AiError('protocol', 'Codex returned invalid credit balance.');

                    credits = {
                        hasCredits: value['hasCredits'],
                        unlimited: value['unlimited'],
                        ...(typeof value['balance'] === 'string'
                            ? { balance: value['balance'] }
                            : {}),
                    };
                }
            } else {
                const summary = record(result['summary']);

                if (!summary)
                    throw new AiError('protocol', 'Codex returned invalid account usage.');

                const lifetime = optionalNumber(summary['lifetimeTokens']);
                const peak = optionalNumber(summary['peakDailyTokens']);
                const streak = optionalNumber(summary['currentStreakDays']);

                tokenUsage = {
                    ...(lifetime !== undefined ? { lifetimeTokens: lifetime } : {}),
                    ...(peak !== undefined ? { peakDailyTokens: peak } : {}),
                    ...(streak !== undefined ? { currentStreakDays: streak } : {}),
                };
            }

            pending.delete(id);
            finish();
        }, 2_097_152);

        await this._runner.run({
            executable: instance.executable ?? 'codex',
            args: [
                'app-server',
                '--listen',
                'stdio://',
                '--config',
                'features.hooks=false',
                '--config',
                'features.plugins=false',
                '--config',
                'features.apps=false',
                '--config',
                'features.multi_agent=false',
                '--config',
                'notify=[]',
            ],
            workingDirectory: instance.profile.paths.home,
            environment: await createCodexEnvironment(instance, snapshot.home),
            keepInputOpen: true,
            signal,
            timeoutMs: 30_000,
            maxOutputBytes: 2_097_152,
            onStart: (control) => {
                process = control;
                send({
                    id: 1,
                    method: 'initialize',
                    params: {
                        clientInfo: { name: 'synapse', title: 'Synapse', version: '0.1.0' },
                        capabilities: { experimentalApi: true },
                    },
                });
            },
            onStdout: (chunk) => lines.push(chunk),
        });
        await lines.finish();

        if (stopping) await stopping;

        if (!complete)
            throw new AiError(
                'protocol',
                'Codex metadata transport ended before its replies completed.',
            );

        const limits: IAiLimit[] = windows.map((window) => ({
            kind: (window.windowDurationMinutes ?? 0) > 60 ? 'quota' : 'rate',
            scope: 'account',
            remaining: window.remainingPercent,
            limit: 100,
            ...(window.resetsAt !== undefined ? { resetsAt: window.resetsAt } : {}),
        }));
        const usage: ICodexAccountUsage = {
            windows,
            ...(planType ? { planType } : {}),
            ...(credits ? { credits } : {}),
            ...(tokenUsage ? { tokenUsage } : {}),
        };

        return {
            models,
            limits,
            usage,
            ...(warnings.length ? { metadataWarnings: warnings } : {}),
        };
    }

    // #endregion
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function text(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;

    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        throw new AiError('protocol', 'Codex returned an invalid metadata number.');

    return value;
}
