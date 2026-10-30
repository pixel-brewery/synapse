// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Serial fragmented JSON-lines decoder with a bounded pending frame.
 *
 * @public
 */
export class JsonLineDecoder {
    // #region Fields

    private _pending = '';

    // #endregion

    // #region Ctor

    /**
     * Creates a decoder; transports must await each push to preserve callback ordering.
     *
     * @param _onFrame - Receives unknown parsed data for provider-owned runtime validation.
     * @param _maxBytes - Maximum pending frame bytes, default 4 MiB.
     * @throws An AiError if the configured frame budget is invalid.
     *
     * @public
     */
    public constructor(
        private readonly _onFrame: (value: unknown) => Promise<void>,
        private readonly _maxBytes = 4 * 1024 * 1024,
    ) {
        if (!Number.isSafeInteger(_maxBytes) || _maxBytes < 1)
            throw new AiError('configuration', 'Invalid JSON frame budget.');
    }

    // #endregion

    // #region Methods

    /**
     * Accepts a UTF-8-decoded transport fragment and emits complete frames in order.
     *
     * @param chunk - Decoded text, possibly split inside a JSON frame.
     * @returns Completion after all complete frames and their callbacks finish.
     * @throws An AiError for malformed or oversized frames; callback errors propagate unchanged.
     *
     * @public
     */
    public async push(chunk: string): Promise<void> {
        this._pending += chunk;

        while (this._pending.includes('\n')) {
            const index = this._pending.indexOf('\n');
            const line = this._pending.slice(0, index);

            this._pending = this._pending.slice(index + 1);
            await this.frame(line);
        }

        if (Buffer.byteLength(this._pending) > this._maxBytes)
            throw new AiError('output-limit', 'A native protocol frame exceeded its byte budget.');
    }

    /**
     * Processes the final optional non-newline-terminated frame.
     *
     * @returns Completion after the final provider callback.
     *
     * @public
     */
    public async finish(): Promise<void> {
        const line = this._pending;

        this._pending = '';
        await this.frame(line);
    }

    private async frame(line: string): Promise<void> {
        if (!line.trim()) return;

        if (Buffer.byteLength(line) > this._maxBytes)
            throw new AiError('output-limit', 'A native protocol frame exceeded its byte budget.');

        let value: unknown;

        try {
            value = JSON.parse(line);
        } catch (cause) {
            throw new AiError('protocol', 'The CLI emitted an invalid JSON frame.', { cause });
        }

        await this._onFrame(value);
    }

    // #endregion
}
