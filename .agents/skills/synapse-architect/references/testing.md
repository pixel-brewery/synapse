# Synapse testing and acceptance

Use common Testing with each affected production foundation. Read actual resolved Nx and Vitest configuration before execution.

- Vitest, English behavior names, explicit Arrange/Act/Assert and one meaningful Act. Restore mocks/timers and clean only owned fixtures. Adjacent exact-owner `Name.spec.ts` files; no fabricated coordinators or feature-named aggregate specs.
- Prove public behavior and credible boundaries: profile isolation, auth transitions/stale responses, process startup/exit/fragmentation, cancellation/deadlines/output limits, malformed messages/results, session binding, retry policy and disposal. Avoid implementation-mirroring tests and incidental wording assertions.
- Replay sanitized real provider frames through actual decoders and normalization. Mock the external transport boundary, not the behavior under test. Include source/version/provenance for replay fixtures; never include credentials or private prompts.
- Cross-platform tests cover native Windows executables, command shims, PATH/PATHEXT, spaces/metacharacters and owned process-tree termination. A macOS run does not prove Windows support; report CI evidence separately.
- Auth and runtime tests share the real gate so blocking/draining races are exercised. Routing tests prove no duplicate provider invocation after cancellation, host-progress/persistence errors or non-repeatable writes.
- Build and pack actual npm artifacts, then install consumers without workspace aliases. Verify every export and NodeNext declaration target. Test inert imports and Codex-only bundle exclusion with both esbuild and Rollup.
- Standalone meeting-text example proves consumer independence. Symphony tests prove its business facade, persistence/progress/error mapping and legacy-path/session compatibility; Synapse tests do not replace that seam.
- Run focused Nx checks, then required integration gates serially. Report commands actually run, real results and pending OS/account-dependent checks. No invented coverage threshold, skipped full-suite pass or personal-account requirement for ordinary CI.
