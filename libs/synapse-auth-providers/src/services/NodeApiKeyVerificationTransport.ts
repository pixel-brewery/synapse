// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { lookup } from 'node:dns';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { LookupFunction, Socket } from 'node:net';
import { ApiKeyVerificationTransportBase } from '../abstracts/ApiKeyVerificationTransportBase.js';
import type { IApiKeyVerificationRequest } from '../interfaces/IApiKeyVerificationRequest.js';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';
import type { INodeApiKeyVerificationTransportOptions } from '../interfaces/INodeApiKeyVerificationTransportOptions.js';

// #endregion

/**
 * Bounded Node.js HTTPS transport for provider authentication and account metadata only.
 *
 * @remarks Every call uses GET, a fresh direct connection and normal TLS certificate verification.
 * Public DNS answers are validated at connection time and pinned to that connection; private,
 * reserved and mixed public/private answers are rejected. Credentials stay in headers. Redirects,
 * compressed responses, automatic retries and ambient proxy configuration are not used. A request
 * settles only after its owned request, response and socket have closed. Imports and construction
 * perform no DNS lookup, network request, timer registration or environment capture.
 *
 * @public
 */
export class NodeApiKeyVerificationTransport extends ApiKeyVerificationTransportBase {
    // #region Fields

    private readonly _timeoutMs: number;
    private readonly _maxResponseBytes: number;
    private readonly _maximumConcurrentRequests: number;
    private readonly _blocked = new BlockList();
    private readonly _globalIpv6 = new BlockList();
    private _active = 0;

    // #endregion

    // #region Ctor

    /**
     * Validates explicit limits without creating connections or reading credentials.
     *
     * @param options - Total timeout, response-byte budget and concurrent-request budget.
     * @throws A safe AiError when a limit is not a positive safe integer or exceeds the timer ceiling.
     *
     * @public
     */
    public constructor(options: INodeApiKeyVerificationTransportOptions = {}) {
        super();

        if (!options || typeof options !== 'object' || Array.isArray(options))
            throw new AiError('configuration', 'The verification transport options are invalid.');

        this._timeoutMs = options.timeoutMs ?? 5000;
        this._maxResponseBytes = options.maxResponseBytes ?? 1024 * 1024;
        this._maximumConcurrentRequests = options.maximumConcurrentRequests ?? 64;

        if (
            [this._timeoutMs, this._maxResponseBytes, this._maximumConcurrentRequests].some(
                (value) => !Number.isSafeInteger(value) || value < 1,
            ) ||
            this._timeoutMs > 2_147_483_647
        ) {
            throw new AiError('configuration', 'The verification transport limits are invalid.');
        }

        for (const [address, prefix] of [
            ['0.0.0.0', 8],
            ['10.0.0.0', 8],
            ['100.64.0.0', 10],
            ['127.0.0.0', 8],
            ['169.254.0.0', 16],
            ['172.16.0.0', 12],
            ['192.0.0.0', 24],
            ['192.0.2.0', 24],
            ['192.88.99.0', 24],
            ['192.168.0.0', 16],
            ['198.18.0.0', 15],
            ['198.51.100.0', 24],
            ['203.0.113.0', 24],
            ['224.0.0.0', 4],
            ['240.0.0.0', 4],
        ] as const) {
            this._blocked.addSubnet(address, prefix, 'ipv4');
        }

        this._globalIpv6.addSubnet('2000::', 3, 'ipv6');
        this._blocked.addSubnet('2001::', 23, 'ipv6');
        this._blocked.addSubnet('2001:db8::', 32, 'ipv6');
        this._blocked.addSubnet('2002::', 16, 'ipv6');
        this._blocked.addSubnet('3fff::', 20, 'ipv6');
    }

    // #endregion

    // #region Methods

    /**
     * Reads one authentication endpoint with bounded DNS, connection and response lifetime.
     *
     * @param request - Public HTTPS endpoint, backend-only headers and caller cancellation.
     * @returns Bounded parsed JSON and HTTP status after the direct connection has closed.
     * @throws A safe AiError for unsafe configuration, cancellation, expiry, concurrency/output limits or transport/protocol failure.
     * @remarks HTTP errors retain their status for provider-specific classification. Non-JSON error
     * bodies are discarded. Response headers are limited to 16 KiB; bodies default to 1 MiB.
     * No key, destination URL, response body or raw error cause appears in a thrown error.
     *
     * @public
     */
    public override async get(
        request: IApiKeyVerificationRequest,
    ): Promise<IApiKeyVerificationResponse> {
        if (
            !request ||
            typeof request !== 'object' ||
            !request.signal ||
            typeof request.signal.aborted !== 'boolean' ||
            typeof request.signal.addEventListener !== 'function' ||
            typeof request.signal.removeEventListener !== 'function'
        ) {
            throw new AiError('configuration', 'The verification request is invalid.');
        }

        const signal = request.signal;

        this.checkAbort(signal);

        const url = this.endpoint(request.url);
        const headers = this.headers(request.headers);

        for (const [name, value] of Object.entries(headers)) {
            if (!/^(?:authorization|x-api-key|x-goog-api-key)$/u.test(name)) continue;

            const secret = value.replace(/^Bearer\s+/iu, '');
            const destination = `${url.pathname}${url.search}`;

            if (
                secret &&
                (destination.includes(secret) || destination.includes(encodeURIComponent(secret)))
            ) {
                throw new AiError(
                    'configuration',
                    'Credentials are not permitted in verification URLs.',
                );
            }
        }

        if (this._active >= this._maximumConcurrentRequests)
            throw new AiError('rate-limit', 'Too many API-key verification requests are active.');

        this._active++;

        let completed = false;
        let pendingLookups = 0;
        let released = false;
        const release = (): void => {
            if (!completed || pendingLookups || released) return;

            released = true;
            this._active--;
        };
        const startLookup = (): (() => void) => {
            pendingLookups++;

            let finished = false;

            return () => {
                if (finished) return;

                finished = true;
                pendingLookups--;
                release();
            };
        };

        try {
            return await this.perform(url, headers, signal, startLookup);
        } finally {
            completed = true;
            release();
        }
    }

    private endpoint(value: string): URL {
        let url: URL;

        try {
            if (typeof value !== 'string' || value.length > 8192) throw new Error();

            url = new URL(value);
        } catch {
            throw new AiError('configuration', 'The verification endpoint is invalid.');
        }

        const hostname = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
        const normalized = hostname.toLowerCase().replace(/\.$/u, '');
        const literal = isIP(hostname);

        if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.hash ||
            !normalized ||
            (!literal && !normalized.includes('.')) ||
            /(?:^|\.)(?:localhost|local|internal|invalid|test)$/u.test(normalized) ||
            (literal && !this.publicAddress(hostname)) ||
            [...url.searchParams.keys()].some((name) =>
                /^(?:key|api[_-]?key|token|access[_-]?token|authorization)$/iu.test(name),
            )
        ) {
            throw new AiError('configuration', 'The verification endpoint is not permitted.');
        }

        return url;
    }

    private headers(values: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
        if (!values || typeof values !== 'object' || Array.isArray(values))
            throw new AiError('configuration', 'The verification headers are invalid.');

        const entries = Object.entries(values);

        if (entries.length > 32)
            throw new AiError('configuration', 'The verification headers exceeded their budget.');

        const headers: Record<string, string> = {
            accept: 'application/json',
            'accept-encoding': 'identity',
            connection: 'close',
        };
        const seen = new Set<string>();
        let bytes = 0;

        for (const [name, value] of entries) {
            const normalized = name.toLowerCase();

            if (
                !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/u.test(name) ||
                /^(?:host|connection|content-length|content-encoding|transfer-encoding|accept-encoding|proxy-.*|__proto__|constructor|prototype)$/u.test(
                    normalized,
                ) ||
                seen.has(normalized) ||
                typeof value !== 'string' ||
                value.length > 66_560 ||
                [...value].some(
                    (character) =>
                        character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f,
                )
            ) {
                throw new AiError('configuration', 'The verification headers are invalid.');
            }

            bytes += Buffer.byteLength(name) + Buffer.byteLength(value);

            if (bytes > 128 * 1024)
                throw new AiError(
                    'configuration',
                    'The verification headers exceeded their budget.',
                );

            seen.add(normalized);
            headers[normalized] = value;
        }

        return Object.freeze(headers);
    }

    private publicAddress(address: string): boolean {
        const family = isIP(address);

        return family === 4
            ? !this._blocked.check(address, 'ipv4')
            : family === 6 &&
                  this._globalIpv6.check(address, 'ipv6') &&
                  !this._blocked.check(address, 'ipv6');
    }

    private checkAbort(signal: AbortSignal): void {
        if (signal.aborted) {
            const expired = signal.reason instanceof AiError && signal.reason.code === 'timeout';

            throw new AiError(
                expired ? 'timeout' : 'cancelled',
                expired ? 'API-key verification expired.' : 'API-key verification was cancelled.',
            );
        }
    }

    private perform(
        url: URL,
        headers: Readonly<Record<string, string>>,
        signal: AbortSignal,
        startLookup: () => () => void,
    ): Promise<IApiKeyVerificationResponse> {
        return new Promise((resolve, reject) => {
            let ownedRequest: ClientRequest | undefined;
            let ownedResponse: IncomingMessage | undefined;
            let ownedSocket: Socket | undefined;
            let requestClosed = false;
            let responseClosed = true;
            let socketClosed = true;
            let settled = false;
            let failure: AiError | undefined;
            let outcome: IApiKeyVerificationResponse | undefined;

            const finish = (): void => {
                if (settled || !requestClosed || !responseClosed || !socketClosed) return;

                settled = true;
                clearTimeout(timer);
                signal.removeEventListener('abort', onAbort);

                if (failure) reject(failure);
                else if (outcome) resolve(outcome);
                else reject(new AiError('provider', 'The API-key verification request failed.'));
            };
            const fail = (error: AiError): void => {
                failure ??= error;
                ownedResponse?.destroy();
                ownedRequest?.destroy();
                ownedSocket?.destroy();
                finish();
            };
            const onAbort = (): void => {
                try {
                    this.checkAbort(signal);
                } catch (error) {
                    fail(
                        error instanceof AiError
                            ? error
                            : new AiError('cancelled', 'API-key verification was cancelled.'),
                    );
                }
            };
            const timer = setTimeout(
                () => fail(new AiError('timeout', 'API-key verification expired.')),
                this._timeoutMs,
            );
            const pinnedLookup: LookupFunction = (hostname, options, callback) => {
                const finishLookup = startLookup();

                try {
                    lookup(hostname, { all: true, order: 'verbatim' }, (error, addresses) => {
                        try {
                            if (signal.aborted || failure) {
                                callback(
                                    new AiError('cancelled', 'API-key verification was cancelled.'),
                                    [],
                                );

                                return;
                            }

                            if (error) {
                                callback(
                                    new AiError(
                                        'provider',
                                        'The verification endpoint could not be resolved.',
                                    ),
                                    [],
                                );

                                return;
                            }

                            if (
                                !addresses.length ||
                                addresses.length > 64 ||
                                addresses.some(
                                    (item) =>
                                        !this.publicAddress(item.address) ||
                                        isIP(item.address) !== item.family,
                                )
                            ) {
                                callback(
                                    new AiError(
                                        'configuration',
                                        'The verification destination is not permitted.',
                                    ),
                                    [],
                                );

                                return;
                            }

                            const selected = addresses[0]!;

                            if (options.all) callback(null, addresses);
                            else callback(null, selected.address, selected.family);
                        } finally {
                            finishLookup();
                        }
                    });
                } catch {
                    finishLookup();
                    callback(
                        new AiError('provider', 'The verification endpoint could not be resolved.'),
                        [],
                    );
                }
            };

            signal.addEventListener('abort', onAbort, { once: true });

            try {
                this.checkAbort(signal);
                ownedRequest = httpsRequest(url, {
                    method: 'GET',
                    headers,
                    agent: false,
                    rejectUnauthorized: true,
                    lookup: pinnedLookup,
                    maxHeaderSize: 16 * 1024,
                });
                ownedRequest.on('error', (error: unknown) =>
                    fail(
                        new AiError(
                            error instanceof AiError ? error.code : 'provider',
                            'The API-key verification request failed.',
                        ),
                    ),
                );
                ownedRequest.once('close', () => {
                    requestClosed = true;

                    if (!outcome && !failure)
                        fail(new AiError('provider', 'The verification connection closed early.'));

                    finish();
                });
                ownedRequest.once('socket', (socket: Socket) => {
                    ownedSocket = socket;
                    socketClosed = socket.closed;

                    if (!socketClosed)
                        socket.once('close', () => {
                            socketClosed = true;
                            finish();
                        });

                    if (failure) socket.destroy();
                });
                ownedRequest.once('response', (response: IncomingMessage) => {
                    ownedResponse = response;
                    responseClosed = false;

                    const chunks: Buffer[] = [];
                    let bytes = 0;
                    const status = response.statusCode;

                    response.on('error', () =>
                        fail(new AiError('provider', 'The verification response failed.')),
                    );
                    response.once('close', () => {
                        responseClosed = true;

                        if (!outcome && !failure)
                            fail(
                                new AiError('provider', 'The verification response closed early.'),
                            );

                        finish();
                    });
                    response.on('data', (chunk: unknown) => {
                        if (failure) return;

                        if (!Buffer.isBuffer(chunk)) {
                            fail(
                                new AiError('protocol', 'The verification response was malformed.'),
                            );

                            return;
                        }

                        bytes += chunk.byteLength;

                        if (bytes > this._maxResponseBytes) {
                            fail(
                                new AiError(
                                    'output-limit',
                                    'The verification response exceeded its byte budget.',
                                ),
                            );

                            return;
                        }

                        chunks.push(chunk);
                    });
                    response.once('end', () => {
                        if (failure || status === undefined) return;

                        let body: unknown;

                        if (bytes) {
                            const json =
                                /(?:^|\s|;)application\/(?:[a-z0-9.+-]+\+)?json(?:\s|;|$)/iu.test(
                                    response.headers['content-type'] ?? '',
                                );

                            try {
                                if (!json) throw new Error();

                                body = JSON.parse(
                                    new TextDecoder('utf-8', { fatal: true }).decode(
                                        Buffer.concat(chunks, bytes),
                                    ),
                                );
                            } catch {
                                if (status >= 200 && status < 300) {
                                    fail(
                                        new AiError(
                                            'protocol',
                                            'The verification endpoint returned invalid JSON.',
                                        ),
                                    );

                                    return;
                                }
                            }
                        }

                        outcome = { status, body };
                        ownedRequest?.destroy();
                        ownedSocket?.destroy();
                        finish();
                    });

                    if (failure) {
                        response.destroy();

                        return;
                    }

                    if (
                        status === undefined ||
                        !Number.isInteger(status) ||
                        status < 100 ||
                        status > 599 ||
                        (status >= 300 && status < 400)
                    ) {
                        fail(
                            new AiError(
                                'protocol',
                                'The verification endpoint returned an unsupported status.',
                            ),
                        );

                        return;
                    }

                    const encoding = response.headers['content-encoding'];

                    if (encoding && encoding.toLowerCase() !== 'identity') {
                        fail(
                            new AiError(
                                'protocol',
                                'The verification endpoint returned an unsupported encoding.',
                            ),
                        );

                        return;
                    }

                    const length = response.headers['content-length'];

                    if (
                        length &&
                        (!/^\d+$/u.test(length) || Number(length) > this._maxResponseBytes)
                    )
                        fail(
                            new AiError(
                                'output-limit',
                                'The verification response exceeded its byte budget.',
                            ),
                        );
                });
                ownedRequest.end();
            } catch (error) {
                if (!ownedRequest) requestClosed = true;

                fail(
                    new AiError(
                        error instanceof AiError ? error.code : 'provider',
                        'The API-key verification request failed.',
                    ),
                );
            }
        });
    }

    // #endregion
}
