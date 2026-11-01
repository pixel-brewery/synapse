// #region Imports

import type { LookupAddress } from 'node:dns';
import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import { isIP } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeApiKeyVerificationTransport } from './NodeApiKeyVerificationTransport.js';

// #endregion

const boundary = vi.hoisted(() => ({ request: vi.fn(), lookup: vi.fn() }));
const invalidHeaders: readonly Readonly<Record<string, string>>[] = [
    { authorization: 'Bearer key\r\nInjected: value' },
    { Host: '127.0.0.1' },
    { 'Proxy-Authorization': 'SYNTHETIC-PRIVATE-KEY' },
    { 'invalid header': 'SYNTHETIC-PRIVATE-KEY' },
    { authorization: 'first', Authorization: 'second' },
];

vi.mock('node:https', () => ({ request: boundary.request }));
vi.mock('node:dns', () => ({ lookup: boundary.lookup }));

afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
});

describe('NodeApiKeyVerificationTransport', () => {
    it('constructs without network, DNS or timer effects', () => {
        // Arrange
        vi.useFakeTimers();

        // Act
        new NodeApiKeyVerificationTransport();

        // Assert
        expect(boundary.request).not.toHaveBeenCalled();
        expect(boundary.lookup).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('uses one GET with secret headers and pins the validated DNS set for native address fallback', async () => {
        // Arrange
        const network = fixture({
            addresses: [
                { address: '93.184.216.34', family: 4 },
                { address: '2606:4700:4700::1111', family: 6 },
            ],
        });
        const transport = new NodeApiKeyVerificationTransport();

        // Act
        const result = await transport.get(verificationRequest());

        // Assert
        expect(result).toEqual({ status: 200, body: { data: [] } });
        expect(boundary.request).toHaveBeenCalledOnce();
        expect(boundary.lookup).toHaveBeenCalledOnce();
        expect(network.pinned).toEqual([
            [
                { address: '93.184.216.34', family: 4 },
                { address: '2606:4700:4700::1111', family: 6 },
            ],
        ]);
        expect(network.options[0]).toMatchObject({
            method: 'GET',
            agent: false,
            rejectUnauthorized: true,
            maxHeaderSize: 16 * 1024,
            headers: {
                authorization: 'Bearer SYNTHETIC-PRIVATE-KEY',
                'accept-encoding': 'identity',
                connection: 'close',
            },
        });
        expect(network.latest().end).toHaveBeenCalledWith();
        expect(network.latest().closed).toBe(true);
        expect(network.latest().response.closed).toBe(true);
        expect(network.latest().socket.closed).toBe(true);
    });

    it('returns one validated address when the native lookup requests a single result', async () => {
        // Arrange
        const network = fixture({
            lookupAll: false,
            addresses: [
                { address: '93.184.216.34', family: 4 },
                { address: '2606:4700:4700::1111', family: 6 },
            ],
        });
        const transport = new NodeApiKeyVerificationTransport();

        // Act
        await transport.get(verificationRequest());

        // Assert
        expect(network.pinned).toEqual(['93.184.216.34']);
        expect(boundary.lookup).toHaveBeenCalledOnce();
    });

    it('awaits actual socket closure after the response and request have completed', async () => {
        // Arrange
        const network = fixture({ automaticSocketClose: false });
        const transport = new NodeApiKeyVerificationTransport();
        let settled = false;
        const result = transport.get(verificationRequest()).finally(() => {
            settled = true;
        });

        await Promise.resolve();
        await Promise.resolve();
        expect(network.latest().closed).toBe(true);
        expect(network.latest().response.closed).toBe(true);
        expect(network.latest().socket.destroyed).toBe(true);
        expect(settled).toBe(false);

        // Act
        network.latest().socket.close();

        // Assert
        await expect(result).resolves.toMatchObject({ status: 200 });
    });

    it.each([
        'http://provider.example/v1/models',
        'https://user:SYNTHETIC-PRIVATE-KEY@provider.example/v1/models',
        'https://localhost/v1/models',
        'https://metadata.internal/v1/models',
        'https://127.0.0.1/v1/models',
        'https://127.1/v1/models',
        'https://0x7f000001/v1/models',
        'https://169.254.169.254/v1/models',
        'https://192.168.0.1/v1/models',
        'https://[::1]/v1/models',
        'https://[::ffff:127.0.0.1]/v1/models',
        'https://[2001:db8::1]/v1/models',
        'https://provider.example/v1/models?key=SYNTHETIC-PRIVATE-KEY',
        'https://provider.example/v1/models?access_token=SYNTHETIC-PRIVATE-KEY',
        'https://provider.example/v1/models#fragment',
        'https://provider.example/SYNTHETIC-PRIVATE-KEY',
    ])(
        'rejects an unsafe or credential-bearing endpoint before DNS or HTTP work: %s',
        async (url) => {
            // Arrange
            fixture();

            const transport = new NodeApiKeyVerificationTransport();

            // Act
            const failure: unknown = await transport
                .get({ ...verificationRequest(), url })
                .catch((error: unknown) => error);

            // Assert
            expect(failure).toMatchObject({ code: 'configuration', cause: undefined });
            expect(String(failure)).not.toContain('SYNTHETIC-PRIVATE');
            expect(boundary.request).not.toHaveBeenCalled();
            expect(boundary.lookup).not.toHaveBeenCalled();
        },
    );

    it.each([
        { address: '127.0.0.1', family: 4 },
        { address: '10.1.2.3', family: 4 },
        { address: '100.64.0.1', family: 4 },
        { address: '169.254.169.254', family: 4 },
        { address: '192.168.1.1', family: 4 },
        { address: '203.0.113.1', family: 4 },
        { address: '224.0.0.1', family: 4 },
        { address: '::1', family: 6 },
        { address: 'fc00::1', family: 6 },
        { address: 'fe80::1', family: 6 },
        { address: '::ffff:127.0.0.1', family: 6 },
        { address: '2002:7f00:1::', family: 6 },
        { address: '2001:db8::1', family: 6 },
        { address: '3fff::1', family: 6 },
    ])('rejects a private, reserved or transition DNS answer: $address', async (address) => {
        // Arrange
        const network = fixture({ addresses: [address] });
        const transport = new NodeApiKeyVerificationTransport();

        // Act
        const result = transport.get(verificationRequest());

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'configuration', cause: undefined });
        expect(network.connected).not.toHaveBeenCalled();
        expect(network.latest().closed).toBe(true);
        expect(network.latest().socket.closed).toBe(true);
    });

    it('rejects mixed public/private DNS answers and never performs a second resolution', async () => {
        // Arrange
        const network = fixture({
            addresses: [
                { address: '93.184.216.34', family: 4 },
                { address: '10.0.0.1', family: 4 },
            ],
        });
        const transport = new NodeApiKeyVerificationTransport();

        // Act
        const result = transport.get(verificationRequest());

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'configuration' });
        expect(boundary.lookup).toHaveBeenCalledOnce();
        expect(network.connected).not.toHaveBeenCalled();
    });

    it('cancels an unresolved destination and never connects when DNS eventually returns', async () => {
        // Arrange
        const network = fixture({ holdDns: true });
        const transport = new NodeApiKeyVerificationTransport();
        const controller = new AbortController();
        const result = transport.get(verificationRequest(controller.signal));

        // Act
        controller.abort(new Error('SYNTHETIC-PRIVATE-KEY'));

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'cancelled', cause: undefined });
        network.completeDns();
        expect(network.connected).not.toHaveBeenCalled();
        expect(network.latest().closed).toBe(true);
        expect(network.latest().socket.closed).toBe(true);
    });

    it('awaits response and socket cleanup before rejecting a cancelled live response', async () => {
        // Arrange
        const network = fixture({
            automaticSocketClose: false,
            connect: (connection) => connection.emit('response', connection.response),
        });
        const transport = new NodeApiKeyVerificationTransport();
        const controller = new AbortController();
        let settled = false;
        const failure = transport
            .get(verificationRequest(controller.signal))
            .catch((error: unknown) => error)
            .finally(() => {
                settled = true;
            });

        // Act
        controller.abort(new Error('SYNTHETIC-PRIVATE-KEY'));
        await Promise.resolve();
        await Promise.resolve();

        // Assert
        expect(settled).toBe(false);
        expect(network.latest().response.closed).toBe(true);
        expect(network.latest().destroyed).toBe(true);
        network.latest().socket.close();
        await expect(failure).resolves.toMatchObject({ code: 'cancelled', cause: undefined });
        expect(String(await failure)).not.toContain('SYNTHETIC-PRIVATE');
    });

    it('applies its total timeout while DNS is pending and closes owned resources', async () => {
        // Arrange
        vi.useFakeTimers();

        const network = fixture({ holdDns: true });
        const transport = new NodeApiKeyVerificationTransport({ timeoutMs: 10 });
        const failure = transport.get(verificationRequest()).catch((error: unknown) => error);

        // Act
        await vi.advanceTimersByTimeAsync(11);

        // Assert
        await expect(failure).resolves.toMatchObject({ code: 'timeout', cause: undefined });
        expect(network.latest().closed).toBe(true);
        expect(network.latest().socket.closed).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
        network.completeDns();
        expect(network.connected).not.toHaveBeenCalled();
    });

    it('bounds concurrent calls and releases admission only after cleanup', async () => {
        // Arrange
        const network = fixture({ connect: () => undefined });
        const transport = new NodeApiKeyVerificationTransport({ maximumConcurrentRequests: 1 });
        const controller = new AbortController();
        const first = transport.get(verificationRequest(controller.signal));

        // Act / Assert
        await expect(transport.get(verificationRequest())).rejects.toMatchObject({
            code: 'rate-limit',
        });
        expect(boundary.request).toHaveBeenCalledOnce();
        controller.abort();
        await expect(first).rejects.toMatchObject({ code: 'cancelled' });

        const next = transport.get(verificationRequest());

        network.latest().emit('response', network.latest().response);
        network.latest().response.finish('{"data":[]}');
        await expect(next).resolves.toMatchObject({ status: 200 });
        expect(boundary.request).toHaveBeenCalledTimes(2);
    });

    it('reserves admission for a timed-out OS lookup until its callback finishes', async () => {
        // Arrange
        vi.useFakeTimers();

        const network = fixture({ holdDns: true });
        const transport = new NodeApiKeyVerificationTransport({
            timeoutMs: 10,
            maximumConcurrentRequests: 1,
        });
        const failure = transport.get(verificationRequest()).catch((error: unknown) => error);

        // Act
        await vi.advanceTimersByTimeAsync(11);

        // Assert
        await expect(failure).resolves.toMatchObject({ code: 'timeout' });
        await expect(transport.get(verificationRequest())).rejects.toMatchObject({
            code: 'rate-limit',
        });
        expect(boundary.request).toHaveBeenCalledOnce();
        network.completeDns();
        expect(network.connected).not.toHaveBeenCalled();

        const next = transport.get(verificationRequest());

        network.completeDns();
        await expect(next).resolves.toMatchObject({ status: 200 });
        expect(boundary.request).toHaveBeenCalledTimes(2);
    });

    it.each(['chunks', 'content-length'] as const)(
        'rejects an oversized response through %s without exposing or retaining its body',
        async (source) => {
            // Arrange
            const network = fixture({
                connect: (connection) => {
                    if (source === 'content-length')
                        connection.response.headers['content-length'] = '64';

                    connection.emit('response', connection.response);
                    connection.response.finish('SYNTHETIC-PRIVATE-KEY');
                },
            });
            const transport = new NodeApiKeyVerificationTransport({ maxResponseBytes: 8 });

            // Act
            const failure: unknown = await transport
                .get(verificationRequest())
                .catch((error: unknown) => error);

            // Assert
            expect(failure).toMatchObject({ code: 'output-limit', cause: undefined });
            expect(String(failure)).not.toContain('SYNTHETIC-PRIVATE');
            expect(network.latest().response.closed).toBe(true);
        },
    );

    it('refuses a redirect without forwarding its authentication headers', async () => {
        // Arrange
        const network = fixture({
            connect: (connection) => {
                connection.response.statusCode = 302;
                connection.response.headers.location =
                    'https://other.example/SYNTHETIC-PRIVATE-KEY';
                connection.emit('response', connection.response);
            },
        });
        const transport = new NodeApiKeyVerificationTransport();

        // Act
        const failure: unknown = await transport
            .get(verificationRequest())
            .catch((error: unknown) => error);

        // Assert
        expect(failure).toMatchObject({ code: 'protocol', cause: undefined });
        expect(String(failure)).not.toContain('SYNTHETIC-PRIVATE');
        expect(boundary.request).toHaveBeenCalledOnce();
        expect(network.latest().response.closed).toBe(true);
    });

    it.each(['json', 'utf8', 'encoding'] as const)(
        'rejects invalid successful %s responses with a safe protocol error',
        async (problem) => {
            // Arrange
            fixture({
                connect: (connection) => {
                    if (problem === 'encoding')
                        connection.response.headers['content-encoding'] = 'gzip';

                    connection.emit('response', connection.response);
                    connection.response.finish(
                        problem === 'utf8'
                            ? Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d])
                            : 'SYNTHETIC-PRIVATE-KEY',
                    );
                },
            });

            const transport = new NodeApiKeyVerificationTransport();

            // Act / Assert
            await expect(transport.get(verificationRequest())).rejects.toMatchObject({
                code: 'protocol',
                cause: undefined,
            });
        },
    );

    it('retains a denial status while discarding a non-JSON private error body', async () => {
        // Arrange
        fixture({
            connect: (connection) => {
                connection.response.statusCode = 401;
                connection.response.headers['content-type'] = 'text/html';
                connection.emit('response', connection.response);
                connection.response.finish('<html>SYNTHETIC-PRIVATE-KEY</html>');
            },
        });

        const transport = new NodeApiKeyVerificationTransport();

        // Act
        const result = await transport.get(verificationRequest());

        // Assert
        expect(result).toEqual({ status: 401, body: undefined });
    });

    it.each(invalidHeaders)(
        'rejects header injection or routing overrides before opening a connection',
        async (headers) => {
            // Arrange
            fixture();

            const transport = new NodeApiKeyVerificationTransport();

            // Act / Assert
            await expect(
                transport.get({ ...verificationRequest(), headers }),
            ).rejects.toMatchObject({ code: 'configuration', cause: undefined });
            expect(boundary.request).not.toHaveBeenCalled();
            expect(boundary.lookup).not.toHaveBeenCalled();
        },
    );

    it.each(['dns', 'request', 'construction'] as const)(
        'sanitizes a native %s error without retaining URL, key, body or cause',
        async (source) => {
            // Arrange
            const network = fixture({
                connect: (connection) =>
                    connection.emit('error', new Error('SYNTHETIC-PRIVATE-KEY')),
            });

            if (source === 'dns')
                boundary.lookup.mockImplementation((_hostname, _options, callback) =>
                    callback(new Error('SYNTHETIC-PRIVATE-KEY'), []),
                );
            else if (source === 'construction')
                boundary.request.mockImplementation(() => {
                    throw new Error('https://private.example/SYNTHETIC-PRIVATE-KEY');
                });

            const transport = new NodeApiKeyVerificationTransport();

            // Act
            const failure: unknown = await transport
                .get(verificationRequest())
                .catch((error: unknown) => error);

            // Assert
            expect(failure).toMatchObject({ code: 'provider', cause: undefined, retryable: false });
            expect(String(failure)).not.toContain('SYNTHETIC-PRIVATE');
            expect(JSON.stringify(failure)).not.toContain('private.example');

            if (source !== 'construction') expect(network.latest().closed).toBe(true);
        },
    );

    it.each([
        { timeoutMs: 0 },
        { timeoutMs: 2_147_483_648 },
        { maxResponseBytes: Infinity },
        { maximumConcurrentRequests: -1 },
    ])('rejects invalid budgets before any network effect', (options) => {
        // Act / Assert
        expect(() => new NodeApiKeyVerificationTransport(options)).toThrow(
            expect.objectContaining({ code: 'configuration', cause: undefined }),
        );
        expect(boundary.request).not.toHaveBeenCalled();
    });
});

function verificationRequest(signal = new AbortController().signal) {
    return {
        url: 'https://provider.example/v1/models?limit=1',
        headers: { authorization: 'Bearer SYNTHETIC-PRIVATE-KEY' },
        signal,
    };
}

function fixture(
    options: {
        addresses?: LookupAddress[];
        holdDns?: boolean;
        lookupAll?: boolean;
        automaticSocketClose?: boolean;
        connect?: (request: MockRequest) => void;
    } = {},
) {
    const requests: MockRequest[] = [];
    const requestOptions: RequestOptions[] = [];
    const pinned: (string | LookupAddress[])[] = [];
    let completeDns: (() => void) | undefined;
    const connected = vi.fn(
        options.connect ??
            ((request: MockRequest) => {
                request.emit('response', request.response);
                request.response.finish('{"data":[]}');
            }),
    );

    boundary.lookup.mockImplementation(
        (
            _hostname: string,
            _options: unknown,
            callback: (error: Error | null, addresses: LookupAddress[]) => void,
        ) => {
            const complete = (): void =>
                callback(null, options.addresses ?? [{ address: '93.184.216.34', family: 4 }]);

            completeDns = complete;

            if (!options.holdDns) complete();
        },
    );
    boundary.request.mockImplementation((url: URL, selected: RequestOptions) => {
        const request = new MockRequest();

        request.socket.automaticClose = options.automaticSocketClose ?? true;
        requests.push(request);
        requestOptions.push(selected);
        request.onEnd = (): void => {
            request.emit('socket', request.socket);

            const onLookup = (error: Error | null, address: string | LookupAddress[]): void => {
                if (error) {
                    request.emit('error', error);

                    return;
                }

                pinned.push(address);

                if (!request.destroyed) connected(request);
            };

            if (isIP(url.hostname)) onLookup(null, url.hostname);
            else if (selected.lookup)
                selected.lookup(url.hostname, { all: options.lookupAll ?? true }, onLookup);
            else throw new Error('The HTTPS request must own its DNS lookup.');
        };

        return request;
    });

    return {
        options: requestOptions,
        pinned,
        connected,
        completeDns: () => {
            if (!completeDns) throw new Error('No DNS lookup is pending.');

            completeDns();
        },
        latest: () => {
            const latest = requests.at(-1);

            if (!latest) throw new Error('No request was created.');

            return latest;
        },
    };
}

class MockSocket extends EventEmitter {
    // #region Fields

    public automaticClose = true;
    public destroyed = false;
    public closed = false;

    // #endregion

    // #region Methods

    public destroy(): this {
        if (this.destroyed) return this;

        this.destroyed = true;

        if (this.automaticClose) void Promise.resolve().then(() => this.close());

        return this;
    }

    public close(): void {
        if (this.closed) return;

        this.closed = true;
        this.emit('close');
    }

    // #endregion
}

class MockResponse extends MockSocket {
    // #region Fields

    public statusCode = 200;
    public headers: Record<string, string> = { 'content-type': 'application/json' };

    // #endregion

    // #region Methods

    public finish(body: string | Buffer): void {
        if (this.destroyed) return;

        this.emit('data', Buffer.isBuffer(body) ? body : Buffer.from(body));

        if (!this.destroyed) this.emit('end');

        void Promise.resolve().then(() => this.close());
    }

    // #endregion
}

class MockRequest extends MockSocket {
    // #region Fields

    public readonly socket = new MockSocket();
    public readonly response = new MockResponse();
    public onEnd?: () => void;
    public readonly end = vi.fn(() => {
        this.onEnd?.();

        return this;
    });

    // #endregion

    // #region Methods

    public override destroy(): this {
        this.socket.destroy();

        return super.destroy();
    }

    // #endregion
}
