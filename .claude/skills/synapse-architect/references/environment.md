# Shared execution environment

Use with every task and delegated assignment.

- Resolve actual runtime owners, installed executable paths, configured services and consumers from executable configuration. Synapse has no product HTTP service, database, frontend or cloud runtime. Do not introduce one to make checks convenient.
- Reuse necessary existing service instances and configured ports. Do not start duplicate helpers, alternate-port servers, extra databases, containers or browser profiles. Inspect ownership before stopping/replacing anything; preserve unrelated processes and user data.
- The leading agent coordinates one heavy generation/build/typecheck/test command at a time across the team, using Nx `--parallel=1` and one test worker. Concurrent disjoint source work is allowed. This developer-machine rule does not prohibit the library's legitimate bounded concurrent provider sessions.
- Use normal configured memory limits; narrow failing checks instead of increasing heaps/workers automatically. Stop task-owned watchers/helpers and confirm owned children terminate.
- No personal AI account is required in ordinary CI. Use fake credentials, protocol replays and owned subprocess fixtures; real CLI login/inference tests are explicitly invoked integration checks.
- Temporary filesystem profiles and subprocess fixtures are valid and necessary isolation tests. They must be task-owned, bounded and cleaned up. They do not create alternative product runtimes or databases.
- For consumer database/browser work, apply that consumer's actual environment contract. Never create/reset/drop a database/schema, run migrations through test hooks or expose credentials. Browser work uses the existing authorized session rather than a new hidden profile.
