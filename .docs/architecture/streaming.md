# Streaming primitives and the RxJS option

Decision, 2026-10-29: keep Synapse's runtime and public contracts native. Use `Promise`, `AsyncIterable`, `AbortSignal` and explicitly bounded queues. Do not add a mandatory RxJS dependency or a second observable API in this delivery.

This is a comparison against the actual CLI runtime requirements, not a general objection to RxJS. Symphony already declares RxJS 7.8.2, while its current provider/application/orchestrator execution path uses promises, callbacks and cancellation signals. Other local consumers need not use RxJS.

| Requirement                                         | Native approach                                                                      | What RxJS would add                                                                                  | Assessment                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| One invocation, optional progress, one final result | A bounded async event iterator plus one completion promise                           | Observable composition and multicasting                                                              | Useful at a consumer boundary; does not replace the run owner  |
| Abort and await owned process trees                 | `AbortSignal`, awaited cancellation and disposal                                     | Synchronous subscription teardown that can initiate cancellation                                     | Awaited cleanup is still a separate contract                   |
| Auth switching                                      | Exclusive profile access, cancellation, drain, verification and correlated responses | Operators for choosing or sequencing state streams                                                   | The exclusive/drain state machine is still required            |
| Capacity and quotas                                 | Bounded admission queues, explicit account scope and persisted cooldowns             | Concurrency, timing and buffering operators                                                          | Queue capacity, persistence and safe retry rules remain custom |
| Consumer UI/event composition                       | Host-owned projections of native events                                              | Filtering, temporal composition, shared observations and integration with existing RxJS applications | A concrete future integration may justify an optional adapter  |

## Why the lifecycle stays explicit

RxJS `unsubscribe()` returns `void`. `switchMap` unsubscribes its prior inner subscription and starts the next one without an asynchronous teardown barrier. Our account-switch contract must wait until old native processes have ended before credentials change. Wrapping that barrier in RxJS would still require the same process and profile owner. Sources: [Subscription implementation](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/Subscription.ts), [switchMap implementation](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/operators/switchMap.ts).

RxJS concurrency operators also do not establish Synapse's bounded pending-work guarantee. The implementation used by `mergeMap` stores excess inputs in a growing buffer; a maximum active subscription count is distinct from a maximum queue length. A bounded adapter is possible, but RxJS does not remove that responsibility. Source: [merge internals](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/operators/mergeInternals.ts).

Critical host persistence must finish or fail explicitly. Observer `next` callbacks return `void`; using `subscribe(async ...)` alone does not make the producer await persistence or classify its rejection. Operators can sequence asynchronous work, but ordering, bounded input and no-failover semantics still need an explicit owner. Source: [RxJS observer and teardown contracts](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/types.ts).

## Compatibility and reconsideration

RxJS already accepts `AsyncIterable` and promises, so the native public contract does not close off consumer-side RxJS integration. A future adapter must share one existing run, define late subscription and bounded replay, and keep asynchronous `cancel()` separate from merely stopping observation. It must not create a new CLI invocation for each subscriber or a retry after a host failure. Source: [native-input conversion](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/observable/innerFrom.ts).

Reconsider an optional integration only when a real consumer needs substantial multi-source temporal composition or multiple observers and the adapter removes repeated application code. The planned meeting-text example has no audio/event-composition requirement. No speculative adapter package, dependency, bundle-size claim or performance claim is introduced now.

The native implementation must still demonstrate bounded streams, completion without event consumption, awaited cancellation, serialized account changes and no duplicate execution after host/persistence failure. This decision does not replace those tests.
