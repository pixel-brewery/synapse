// #region Imports

import {
    AiError,
    type IAiExecutionContext,
    type IAiDriverResult,
    type IAiUsage,
} from '@pixel-brewery/synapse-core';
import { boundedText } from '@pixel-brewery/synapse-runtime';
import { isAbsolute, relative, resolve, win32 } from 'node:path';
import { codexFailure } from './codexFailure.js';

// #endregion

/**
 * Normalizes validated Codex exec JSONL frames for one turn; raw commands stay private.
 *
 * @public
 */
export class CodexEventDecoder {
    // #region Fields

    private _text = '';
    private _sessionId: string | undefined;
    private _usage: IAiUsage | undefined;
    private _failure: string | undefined;
    private _diagnostic: string | undefined;

    // #endregion

    // #region Ctor

    /**
     * Creates turn-local protocol state.
     *
     * @param _context - Isolated execution context and critical event callback.
     *
     * @public
     */
    public constructor(private readonly _context: IAiExecutionContext) {}

    // #endregion

    // #region Methods

    /**
     * Validates and projects one native protocol frame.
     *
     * @param frame - Unknown JSON value from the external transport.
     * @returns Completion after the normalized critical event is accepted.
     * @throws An AiError for malformed known frames; host callback errors propagate unchanged.
     *
     * @public
     */
    public async accept(frame: unknown): Promise<void> {
        const event = record(frame);

        if (!event || typeof event['type'] !== 'string')
            throw new AiError('protocol', 'Codex returned an invalid event.');

        const type = event['type'];

        if (type === 'thread.started') {
            const id = event['thread_id'];

            if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u.test(id))
                throw new AiError('protocol', 'Codex returned an invalid session identifier.');

            this._sessionId = id;
            await this._context.emit({ type: 'session', session: this._context.session(id) });
        } else if (type === 'turn.started') {
            await this._context.emit({
                type: 'progress',
                category: 'status',
                message: 'Codex is processing the request.',
            });
        } else if (type === 'turn.completed' && event['usage'] !== undefined) {
            const raw = record(event['usage']);

            if (!raw) throw new AiError('protocol', 'Codex returned invalid token usage.');

            const input = tokens(raw['input_tokens']);
            const cachedInput = tokens(raw['cached_input_tokens']);
            const output = tokens(raw['output_tokens']);

            this._usage = { input, cachedInput, output, total: input + output };
            await this._context.emit({ type: 'usage', usage: this._usage });
        } else if (type === 'error' || type === 'turn.failed') {
            const diagnostic =
                string(event['message']) ??
                string(record(event['error'])?.['message']) ??
                'Native turn failed.';

            if (type === 'turn.failed') this._failure = diagnostic;
            else this._diagnostic = diagnostic;

            await this._context.emit({
                type: 'progress',
                category: 'error',
                message:
                    type === 'turn.failed'
                        ? 'Codex reported an execution failure.'
                        : 'Codex reported an error.',
            });
        } else if (type === 'item.started' || type === 'item.completed') {
            const item = record(event['item']);

            if (!item || typeof item['type'] !== 'string')
                throw new AiError('protocol', 'Codex returned an invalid item.');

            const completed = type === 'item.completed';

            if (item['type'] === 'agent_message' && completed) {
                if (typeof item['text'] !== 'string')
                    throw new AiError('protocol', 'Codex returned an invalid message.');

                this._text = item['text'].trim();

                if (this._text)
                    await this._context.emit({ type: 'text', text: boundedText(this._text) });
            } else if (item['type'] === 'reasoning' && completed && string(item['text'])) {
                await this._context.emit({
                    type: 'progress',
                    category: 'reasoning',
                    message: boundedText(string(item['text'])!),
                });
            } else if (item['type'] === 'file_change' && Array.isArray(item['changes'])) {
                const paths = item['changes'].slice(0, 256).flatMap((change: unknown) => {
                    const path = string(record(change)?.['path']);

                    return path ? [displayPath(path, this._context.workingDirectory)] : [];
                });

                if (paths.length)
                    await this._context.emit({
                        type: 'progress',
                        category: 'file-change',
                        message: boundedText(
                            `${completed ? 'Files changed' : 'Changing files'}: ${paths.join(', ')}`,
                        ),
                    });
            } else if (item['type'] === 'mcp_tool_call') {
                const label =
                    [string(item['server']), string(item['tool'])].filter(Boolean).join(' / ') ||
                    'external tool';

                await this._context.emit({
                    type: 'progress',
                    category: 'tool',
                    message: boundedText(
                        `${completed ? 'Tool completed' : 'Calling tool'}: ${label}`,
                    ),
                });
            } else if (item['type'] === 'web_search' && string(item['query'])) {
                await this._context.emit({
                    type: 'progress',
                    category: 'tool',
                    message: boundedText(`Web search: ${string(item['query'])!}`),
                });
            }
            // command_execution deliberately projects neither command nor aggregated_output.
        }
    }

    /**
     * Produces the same native turn's final result after transport cleanup.
     *
     * @param exitCode - Native process exit code.
     * @param stderr - Private native diagnostic used only for safe error classification.
     * @returns Final text, continuation and latest cumulative usage.
     * @throws An AiError for native failure or a missing final result.
     *
     * @public
     */
    public complete(exitCode: number | null, stderr: string): IAiDriverResult {
        if (this._failure || exitCode !== 0)
            throw codexFailure(
                this._failure ?? this._diagnostic ?? stderr,
                Boolean(this._context.request.session),
            );

        if (!this._text)
            throw new AiError('provider', 'Codex completed without a final result.', {
                retryable: true,
            });

        return {
            text: this._text,
            ...(this._sessionId ? { sessionId: this._sessionId } : {}),
            ...(this._usage ? { usage: this._usage } : {}),
        };
    }

    // #endregion
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function tokens(value: unknown): number {
    if (value === undefined) return 0;

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        throw new AiError('protocol', 'Codex returned invalid token usage.');

    return value;
}

function displayPath(value: string, directory: string): string {
    const paths = win32.isAbsolute(directory) ? win32 : { isAbsolute, relative, resolve };
    const absolute = paths.isAbsolute(value) ? value : paths.resolve(directory, value);
    const path = paths.relative(directory, absolute);
    const separator = String.fromCharCode(92);

    if (
        path === '..' ||
        path.startsWith('../') ||
        path.startsWith(`..${separator}`) ||
        paths.isAbsolute(path)
    )
        return '[outside workspace]';

    return path.split(separator).join('/') || '.';
}
