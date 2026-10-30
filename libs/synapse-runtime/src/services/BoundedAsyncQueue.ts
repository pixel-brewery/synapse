// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Single-consumer event queue whose producer never waits for optional observation.
 *
 * @typeParam T - Event or state snapshot delivered to the consumer.
 *
 * @public
 */
export class BoundedAsyncQueue<T> implements AsyncIterable<T> {
    // #region Fields

    private readonly _values: T[] = [];
    private _waiting?: (value: IteratorResult<T>) => void;
    private _closed = false;
    private _claimed = false;
    private _returned = false;
    private _dropped = 0;

    // #endregion

    // #region Ctor

    /**
     * Creates a bounded queue without starting work or timers.
     *
     * @param _capacity - Maximum retained values; a positive safe integer, default 256.
     * @param _overflowFactory - Optional summary emitted before retained values after overflow.
     * @throws An AiError when capacity is invalid.
     *
     * @public
     */
    public constructor(
        private readonly _capacity = 256,
        private readonly _overflowFactory?: (dropped: number) => T,
    ) {
        if (!Number.isSafeInteger(_capacity) || _capacity < 1) {
            throw new AiError('configuration', 'Event capacity must be a positive safe integer.');
        }
    }

    // #endregion

    // #region Methods

    /**
     * Publishes a value, dropping the oldest retained value when capacity is exhausted.
     *
     * @param value - Immutable event/state snapshot; late values after closure are ignored.
     *
     * @public
     */
    public push(value: T): void {
        if (this._closed || this._returned) return;

        if (this._waiting) {
            const waiting = this._waiting;

            this._waiting = undefined;
            waiting({ done: false, value });

            return;
        }

        if (this._values.length === this._capacity) {
            this._values.shift();
            this._dropped++;
        }

        this._values.push(value);
    }

    /**
     * Ends observation after retained values drain, independently of the operation result.
     *
     * @public
     */
    public close(): void {
        this._closed = true;

        if (this._waiting) {
            this._waiting({ done: true, value: undefined });
            this._waiting = undefined;
        }
    }

    /**
     * Claims the queue's single iterator; hosts may multicast its events externally.
     *
     * @returns Iterator over retained values and optional overflow summaries.
     * @throws An AiError when another consumer already claimed the stream.
     * @remarks Returning from observation does not cancel the separate operation.
     *
     * @public
     */
    public [Symbol.asyncIterator](): AsyncIterator<T> {
        if (this._claimed) throw new AiError('configuration', 'The event stream has one consumer.');

        this._claimed = true;

        return {
            next: async (): Promise<IteratorResult<T>> => {
                if (this._returned) return { done: true, value: undefined };

                if (this._dropped && this._overflowFactory) {
                    const dropped = this._dropped;

                    this._dropped = 0;

                    return { done: false, value: this._overflowFactory(dropped) };
                }

                if (this._values.length) return { done: false, value: this._values.shift()! };

                if (this._closed) return { done: true, value: undefined };

                if (this._waiting)
                    throw new AiError(
                        'configuration',
                        'Concurrent iterator reads are unsupported.',
                    );

                return new Promise<IteratorResult<T>>((resolve) => {
                    this._waiting = resolve;
                });
            },
            return: async (): Promise<IteratorResult<T>> => {
                this._returned = true;
                this._values.length = 0;
                this.close();

                return { done: true, value: undefined };
            },
        };
    }

    // #endregion
}
