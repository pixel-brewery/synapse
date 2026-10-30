# Contracts and validation

Use with common contracts, architecture and date/time foundations and the public documentation rules.

- Keep intent, result, events, errors and capabilities provider-neutral. Vendor protocol types and raw SDK errors stay in the provider package. Profiles and sessions have explicit binding and lifecycle, never ambient current-account state.
- Model state as immutable values and discriminated unions. Runtime validation is required for user configuration, persisted data and external CLI/ACP messages. Types alone do not validate JSON. Reject invalid structured output with a typed result-validation error.
- Prefer schema-first definitions where runtime validation and generated contracts must agree. Do not add a second hand-maintained shape or a mandatory schema framework to Node-free core. Document each schema dialect and supported validation behavior.
- Separate progress events, final results, session usability and host failures. Correlate execution/auth/interaction IDs; reject stale owner or interaction responses. Retain safe causes internally and redact credentials/private raw payloads at public boundaries.
- Store absolute deadlines/expiry instants in a documented format, inject clocks for deterministic tests, and separate elapsed durations from wall-clock instants. Define time-zone semantics rather than relying on a machine locale.
- A failing host callback or persistence write does not mean a provider attempt failed safely. Cancel/drain execution and propagate the host failure without failover. Optional telemetry degradation must be an explicit policy.
- Public contracts require complete TSDoc, export consistency, runtime validation evidence and a documented compatibility/migration path. New required abstract members affect all adapters.
