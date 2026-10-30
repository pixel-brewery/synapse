// #region Imports

import {
    AiError,
    type IAiDriverResult,
    type IAiExecutionContext,
    type IAiUsage,
} from '@pixel-brewery/synapse-core';
import { boundedText } from '@pixel-brewery/synapse-runtime';
import { isAbsolute, relative, resolve, win32 } from 'node:path';
import { claudeFailure } from './claudeFailure.js';

// #endregion

/**
 * Strict turn-local Claude stream-json normalization with bounded tool-result correlation.
 *
 * @public
 */
export class ClaudeEventDecoder {
    // #region Fields

    private readonly _tools = new Map<string, string>();
    private _result: IAiDriverResult | undefined;
    private _sessionId: string | undefined;
    private _failure: string | undefined;
    private _usage: IAiUsage | undefined;

    // #endregion

    // #region Ctor

    /**
     * Creates one turn's protocol state without process or discovery work.
     *
     * @param _context - Isolated execution context and critical event delivery.
     *
     * @public
     */
    public constructor(private readonly _context: IAiExecutionContext) {}

    // #endregion

    // #region Methods

    /**
     * Validates and normalizes one externally supplied JSON frame.
     *
     * @param frame - Unknown native stream-json value.
     * @returns Completion after critical normalized progress is accepted.
     * @throws An AiError for malformed known frames; host event failures propagate unchanged.
     *
     * @public
     */
    public async accept(frame: unknown): Promise<void> {
        const event = record(frame);

        if (!event || typeof event['type'] !== 'string')
            throw new AiError('protocol', 'Claude returned an invalid event.');

        const type = event['type'];

        if (type === 'system' && event['subtype'] === 'init') {
            const id = event['session_id'];

            if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u.test(id))
                throw new AiError('protocol', 'Claude returned an invalid session identifier.');

            this._sessionId = id;
            await this._context.emit({ type: 'session', session: this._context.session(id) });

            return;
        }

        if (type === 'assistant' || type === 'user') {
            const message = record(event['message']);

            if (!message) throw new AiError('protocol', 'Claude returned invalid message content.');

            if (typeof message['content'] === 'string') {
                if (type === 'assistant' && message['content'].trim())
                    await this._context.emit({
                        type: 'text',
                        text: boundedText(message['content']),
                    });

                return;
            }

            if (!Array.isArray(message['content']))
                throw new AiError('protocol', 'Claude returned invalid message content.');

            for (const raw of message['content']) {
                const block = record(raw);

                if (!block || typeof block['type'] !== 'string')
                    throw new AiError('protocol', 'Claude returned an invalid content block.');

                if (type === 'assistant') {
                    if (block['type'] === 'text') {
                        if (typeof block['text'] !== 'string')
                            throw new AiError(
                                'protocol',
                                'Claude returned invalid assistant text.',
                            );

                        if (block['text'].trim())
                            await this._context.emit({
                                type: 'text',
                                text: boundedText(block['text']),
                            });
                    } else if (
                        block['type'] === 'thinking' &&
                        typeof block['thinking'] === 'string' &&
                        block['thinking'].trim()
                    ) {
                        await this._context.emit({
                            type: 'progress',
                            category: 'reasoning',
                            message: boundedText(block['thinking']),
                        });
                    } else if (block['type'] === 'tool_use') {
                        const name = text(block['name']);

                        if (!name)
                            throw new AiError('protocol', 'Claude returned an invalid tool call.');

                        const id = text(block['id']);

                        if (id) {
                            this._tools.set(id, name);

                            if (this._tools.size > 256)
                                this._tools.delete(this._tools.keys().next().value!);
                        }

                        if (name === 'Bash' || name === 'PowerShell') continue;

                        const input = record(block['input']);
                        const path = input
                            ? (text(input['file_path']) ?? text(input['notebook_path']))
                            : undefined;
                        const changed =
                            ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(name) && path;

                        await this._context.emit({
                            type: 'progress',
                            category: changed ? 'file-change' : 'tool',
                            message: boundedText(
                                changed
                                    ? `Changing file: ${displayPath(path!, this._context.workingDirectory)}`
                                    : `Calling tool: ${name}`,
                            ),
                        });
                    }
                } else if (block['type'] === 'tool_result') {
                    const id = text(block['tool_use_id']);
                    const label = id ? this._tools.get(id) : undefined;

                    if (id) this._tools.delete(id);

                    if (block['is_error'] === true)
                        await this._context.emit({
                            type: 'progress',
                            category: 'tool',
                            message: boundedText(`Tool failed: ${label ?? 'native tool'}`),
                        });
                    // Arbitrary tool result bodies and shell output never become public progress.
                }
            }

            return;
        }

        if (type === 'result') {
            if (event['is_error'] !== undefined && typeof event['is_error'] !== 'boolean')
                throw new AiError('protocol', 'Claude returned invalid completion status.');

            if (event['is_error'] === true) {
                this._failure =
                    text(event['result']) ??
                    text(record(event['error'])?.['message']) ??
                    'Native turn failed.';

                return;
            }

            const result = event['result'];

            if (result !== undefined && typeof result !== 'string')
                throw new AiError('protocol', 'Claude returned an invalid final result.');

            const nativeSession = event['session_id'];

            if (
                nativeSession !== undefined &&
                (typeof nativeSession !== 'string' ||
                    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u.test(nativeSession))
            )
                throw new AiError('protocol', 'Claude returned an invalid session identifier.');

            this._sessionId = typeof nativeSession === 'string' ? nativeSession : this._sessionId;

            const usage = event['usage'];

            if (usage !== undefined) {
                const value = record(usage);

                if (!value) throw new AiError('protocol', 'Claude returned invalid token usage.');

                const input = tokens(value['input_tokens']);
                const output = tokens(value['output_tokens']);
                const cachedInput =
                    tokens(value['cache_read_input_tokens']) +
                    tokens(value['cache_creation_input_tokens']);

                this._usage = { input, output, cachedInput, total: input + output };
                await this._context.emit({ type: 'usage', usage: this._usage });
            }

            const structured = event['structured_output'];

            this._result = {
                text:
                    typeof result === 'string' && result.trim()
                        ? result.trim()
                        : structured !== undefined
                          ? JSON.stringify(structured)
                          : '',
                ...(structured !== undefined ? { structured } : {}),
                ...(this._sessionId ? { sessionId: this._sessionId } : {}),
                ...(this._usage ? { usage: this._usage } : {}),
            };
        }
    }

    /**
     * Completes normalization after the native process and serialized callbacks finish.
     *
     * @param exitCode - Native process completion status.
     * @param stderr - Private diagnostic used only for classification.
     * @returns This invocation's final native result, session and cumulative usage.
     * @throws An AiError for native failure, missing result or invalid completion.
     *
     * @public
     */
    public complete(exitCode: number | null, stderr: string): IAiDriverResult {
        if (this._failure || exitCode !== 0)
            throw claudeFailure(this._failure ?? stderr, Boolean(this._context.request.session));

        if (!this._result?.text)
            throw new AiError('provider', 'Claude completed without a final result.', {
                retryable: true,
            });

        return this._result;
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

function tokens(value: unknown): number {
    if (value === undefined) return 0;

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        throw new AiError('protocol', 'Claude returned invalid token usage.');

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
