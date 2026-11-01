# Interface: INodeApiKeyVerificationTransportOptions

Resource limits for the built-in Node.js HTTPS authentication transport.

## Properties

### maximumConcurrentRequests?

> `readonly` `optional` **maximumConcurrentRequests?**: `number`

Maximum requests owned concurrently by this transport; default 64.
Excess requests reject immediately instead of joining an unbounded queue.
A non-cancellable OS DNS lookup retains its slot until its callback completes,
including after the caller has already timed out or cancelled.

***

### maxResponseBytes?

> `readonly` `optional` **maxResponseBytes?**: `number`

Maximum uncompressed response bytes retained or read; default 1 MiB.
Compressed responses are rejected instead of being decompressed.

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Total lifetime including DNS, connection and response; default 5,000 milliseconds.
Must be a positive safe integer within Node.js's timer ceiling.
