// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { stdin, stderr, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { MeetingNotesExample } from './MeetingNotesExample.js';

// #endregion

/**
 * Runs the standalone meeting-text consumer with explicit provider selection.
 *
 * @param arguments_ - Host CLI arguments, excluding the Node executable and script path.
 * @returns Completion after the selected operation and owned cleanup.
 * @throws An AiError when input, native execution or validation fails.
 *
 * @internal
 */
export async function main(arguments_: readonly string[]): Promise<void> {
    const controller = new AbortController();
    const interrupt = (): void =>
        controller.abort(new AiError('cancelled', 'The meeting example was interrupted.'));

    process.once('SIGINT', interrupt);

    try {
        await new MeetingNotesExample({
            output: (value) => {
                stdout.write(`${value}\n`);
            },
            diagnostic: (value) => {
                stderr.write(`${value}\n`);
            },
            input: readInput,
        }).run(arguments_, controller.signal);
    } finally {
        process.removeListener('SIGINT', interrupt);
    }
}

async function readInput(label: string, secret: boolean, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();

    if (!stdin.isTTY)
        throw new AiError('unsupported', 'Native login input requires an interactive terminal.');

    const wasRaw = stdin.isRaw;
    const wasPaused = stdin.isPaused();

    stderr.write(`${label}: `);

    return new Promise<string>((resolveInput, reject) => {
        let value = '';
        const decoder = new TextDecoder();
        const cleanup = (): void => {
            stdin.removeListener('data', data);
            signal.removeEventListener('abort', abort);
            stdin.setRawMode(wasRaw);

            if (wasPaused) stdin.pause();

            stderr.write('\n');
        };
        const finish = (cause?: unknown): void => {
            cleanup();

            if (cause) reject(cause);
            else resolveInput(value);
        };
        const abort = (): void => finish(new AiError('cancelled', 'Native login input ended.'));
        const data = (chunk: Buffer | string): void => {
            for (const character of typeof chunk === 'string'
                ? chunk
                : decoder.decode(chunk, { stream: true })) {
                const code = character.codePointAt(0) ?? 0;

                if (code === 3 || code === 4) {
                    finish(new AiError('cancelled', 'Native login input was cancelled.'));

                    return;
                }

                if (code === 10 || code === 13) {
                    finish();

                    return;
                }

                if (code === 127 || code === 8) {
                    value = [...value].slice(0, -1).join('');

                    continue;
                }

                if (code < 32) continue;

                value += character;

                if (!secret) stderr.write(character);

                if (value.length > 4096) {
                    finish(new AiError('configuration', 'Native login input exceeded its limit.'));

                    return;
                }
            }
        };

        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('data', data);
        signal.addEventListener('abort', abort, { once: true });
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await main(process.argv.slice(2));
    } catch (cause) {
        stderr.write(
            `${cause instanceof AiError ? cause.message : 'The meeting example failed.'}\n`,
        );
        process.exitCode = 1;
    }
}
