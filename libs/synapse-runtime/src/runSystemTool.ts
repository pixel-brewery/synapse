// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

// #endregion

/**
 * Runs one owned native cleanup helper and waits for its exit, including after forced termination.
 *
 * @param executable - Explicit absolute system executable supplied by the process owner.
 * @param args - Literal cleanup or ownership-inspection argument vector.
 * @param capture - Whether to capture at most 64,000 bytes of standard output.
 * @param onOutput - Optional bounded capture delivered on completion or failure, so the owner can retain complete process identifiers from a partial inspection.
 * @returns Standard output after a successful zero-status exit.
 * @throws An AiError on launch failure, nonzero exit, a 5-second execution timeout, oversized output or failure to exit within 1 second after forced termination.
 *
 * @internal
 */
export function runSystemTool(
    executable: string,
    args: readonly string[],
    capture = false,
    onOutput?: (output: string) => void,
): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let helper: ChildProcess;

        try {
            helper = spawn(executable, [...args], {
                stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore'],
                windowsHide: true,
            });
        } catch (cause) {
            reject(new AiError('host', 'Native process cleanup could not start.', { cause }));

            return;
        }

        let output = '';
        let bytes = 0;
        let failure: AiError | undefined;
        let closed = false;
        let reapTimeout: ReturnType<typeof setTimeout> | undefined;
        const terminate = (cause: AiError): void => {
            if (failure) return;

            failure = cause;

            try {
                onOutput?.(output);
            } catch {
                // The original cleanup failure remains authoritative.
            }

            try {
                helper.kill('SIGKILL');
            } catch {
                // Closure remains the completion barrier even when the signal itself fails.
            }

            if (closed) return;

            reapTimeout = setTimeout(() => {
                clearTimeout(timeout);
                reject(
                    new AiError('host', 'A native cleanup helper did not exit after termination.', {
                        cause: failure,
                    }),
                );
            }, 1_000);
        };
        const timeout = setTimeout(() => {
            terminate(new AiError('host', 'Native process cleanup timed out.'));
        }, 5_000);

        helper.stdout?.on('data', (buffer: Buffer) => {
            if (failure) return;

            bytes += buffer.byteLength;

            if (bytes > 64_000) {
                terminate(
                    new AiError('host', 'Native process ownership inspection exceeded its budget.'),
                );

                return;
            }

            output += buffer.toString('utf8');
        });
        helper.once('error', (cause) => {
            terminate(new AiError('host', 'Native process cleanup could not start.', { cause }));
        });
        helper.once('close', (code, signal) => {
            closed = true;
            clearTimeout(timeout);
            clearTimeout(reapTimeout);

            if (!failure) {
                try {
                    onOutput?.(output);
                } catch (cause) {
                    failure = new AiError('host', 'Native process ownership capture failed.', {
                        cause,
                    });
                }
            }

            if (failure) reject(failure);
            else if (code !== 0 || signal !== null)
                reject(
                    new AiError('host', 'A native process cleanup helper exited unsuccessfully.'),
                );
            else resolve(output);
        });
    });
}
