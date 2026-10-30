# Consuming Synapse

Synapse packages are composed explicitly in a local Node.js 24.15+ host. Core contracts are provider-neutral; native process work belongs in the runtime and selected driver. Applications own prompts, workflows, approval decisions, visible catalogs, durable databases and the presentation of results.

## Install from GitHub Packages

The initial family version is `0.0.1`. Packages target public GitHub Packages at `https://npm.pkg.github.com` under `@pixel-brewery`. The MIT-licensed source is being prepared for public hosting at [pixel-brewery/synapse](https://github.com/pixel-brewery/synapse); repository transfer and visibility are separate [owner launch steps](releases.md#public-source-launch). Install a published version after exact-version and package-visibility checks described in the [release guide](releases.md).

GitHub's npm registry requires authentication even for public packages. Supply a personal access token (classic) with `read:packages` through the environment or your credential store. This registry credential is separate from native Codex, Claude Code or OpenCode login. See the [official GitHub npm registry guide](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

For Yarn 4 consumers, merge this scope configuration into `.yarnrc.yml`; the example reads `NODE_AUTH_TOKEN` from the environment:

```yaml
nodeLinker: node-modules
npmScopes:
    pixel-brewery:
        npmRegistryServer: 'https://npm.pkg.github.com'
        npmAlwaysAuth: true
        npmAuthToken: '${NODE_AUTH_TOKEN}'
```

For npm consumers, use the corresponding `.npmrc` scope mapping and environment reference:

```ini
@pixel-brewery:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Keep literal token values out of tracked files. Configure only the `@pixel-brewery` scope; other package scopes can keep their existing registries. Once the published `0.0.1` family has been verified, a Codex host can install:

```sh
yarn add @pixel-brewery/synapse-core@0.0.1 @pixel-brewery/synapse-runtime@0.0.1 @pixel-brewery/synapse-auth@0.0.1 @pixel-brewery/synapse-provider-codex@0.0.1
```

Repository-hosted guides and source links become public when the owner completes the source launch. Public source access requires no package-registry credential; installing GitHub Packages still requires registry authentication. The optional MCP package includes its documentation corpus and needs no source checkout after installation.

## Local archive alternative

For local integration or evaluation before registry verification, build and verify archives from an authorized Synapse checkout:

```sh
yarn install --immutable
yarn packaging:verify
```

The target builds its prerequisites and writes the nine library archives and optional MCP archive to `artifacts/packages/`. A Codex consumer with profile/auth management needs these four files, copied into its own `vendor/synapse/` directory:

```text
synapse-core-0.0.1.tgz
synapse-runtime-0.0.1.tgz
synapse-auth-0.0.1.tgz
synapse-provider-codex-0.0.1.tgz
```

Merge the following into the consuming application's `package.json`, preserving its existing dependencies and resolutions:

```json
{
    "private": true,
    "type": "module",
    "packageManager": "yarn@4.18.1",
    "dependencies": {
        "@pixel-brewery/synapse-core": "file:./vendor/synapse/synapse-core-0.0.1.tgz",
        "@pixel-brewery/synapse-runtime": "file:./vendor/synapse/synapse-runtime-0.0.1.tgz",
        "@pixel-brewery/synapse-auth": "file:./vendor/synapse/synapse-auth-0.0.1.tgz",
        "@pixel-brewery/synapse-provider-codex": "file:./vendor/synapse/synapse-provider-codex-0.0.1.tgz"
    },
    "resolutions": {
        "@pixel-brewery/synapse-core": "file:./vendor/synapse/synapse-core-0.0.1.tgz",
        "@pixel-brewery/synapse-runtime": "file:./vendor/synapse/synapse-runtime-0.0.1.tgz",
        "@pixel-brewery/synapse-auth": "file:./vendor/synapse/synapse-auth-0.0.1.tgz",
        "@pixel-brewery/synapse-provider-codex": "file:./vendor/synapse/synapse-provider-codex-0.0.1.tgz"
    }
}
```

Use the verified node-modules linker in the consumer's `.yarnrc.yml`:

```yaml
nodeLinker: node-modules
```

Run `yarn install` in that application. The matching resolutions matter: packed packages refer to sibling packages through SemVer ranges, so the resolutions direct those edges to the same local archives without fetching the sibling packages from a registry. Keep the family on one version and import public package names normally. Add another provider or routing/testing archive only when the application uses it.

After the selected public GitHub Packages version passes registry verification, registry dependencies can replace these local archive entries together. Follow the [release guide](releases.md) for actual publication status and the [compatibility guide](cli-compatibility.md) for native CLI prerequisites.

## A minimal native consumer

```ts
import { ProfileManager, AuthManager } from '@pixel-brewery/synapse-auth';
import { AiRuntime, NodeProcessRunner } from '@pixel-brewery/synapse-runtime';
import { CodexDriver } from '@pixel-brewery/synapse-provider-codex';

// Choose an absolute application-owned directory for your operating system.
const profiles = new ProfileManager({ rootDirectory: '/absolute/application-owned/profiles' });
const profile = await profiles.create({
    applicationId: 'my-local-tool',
    accountId: 'personal',
    driverId: 'codex',
});
const runner = new NodeProcessRunner();
const driver = new CodexDriver(runner);
const instance = { id: 'personal', driverId: driver.id, profile };
const runtime = new AiRuntime({ drivers: [driver], instances: [instance] });
const auth = new AuthManager(runtime.access);

try {
    const result = await runtime.run({
        target: { instanceId: instance.id },
        prompt: 'Summarize the supplied text.',
        policy: { mode: 'read-only' },
    }).result;
    console.log(result.text);
} finally {
    const cleanup = await Promise.allSettled([auth.dispose(), runtime.dispose(), runner.dispose()]);
    const failures = cleanup
        .filter((outcome) => outcome.status === 'rejected')
        .map((outcome) => outcome.reason);
    if (failures.length) throw new AggregateError(failures, 'Native AI cleanup failed.');
}
```

This execution example assumes the created/mapped profile already contains valid native authentication. On first use, complete the [explicit authentication flow](#explicit-authentication) before calling `run`; creating a profile alone does not sign in. The standalone [meeting-text example](../../apps/meeting-notes/README.md) demonstrates an interactive host with a deliberately separate application profile.

A text-only request without a working directory receives an owned temporary workspace. It needs no Git repository. Existing workspaces remain host-owned; Synapse does not create product worktrees, commit, merge or publish on behalf of the host.

A handle's `events` stream is optional. `result` completes independently of stream consumption; slow consumers receive bounded overflow summaries. Supply `onEvent` only for a critical host callback such as persistence. Its failure cancels and drains the current execution and cannot trigger provider fallback.

An `AiError` with `cleanupIncomplete` means owned native process termination could not be confirmed. The shared profile coordinator keeps that profile blocked for execution and credential changes. Cancellation cannot convert this fault into an ordinary cancelled result, and disposal reports it after all cleanup attempts settle. The host must confirm process cleanup before creating replacement runtime/coordinator state; Synapse does not reset or retry this condition automatically.

Use `outputSchema` for actual JSON Schema validation. Native structured output is used when a driver supports it; every result is validated locally. The application still decodes its own business result and decides how to present it.

## Persisted sessions

Persist the complete `IAiSessionReference` from a session event or final result, including its driver, instance, profile, candidate and `authenticationGeneration`. Hosts with an opaque string field can store `encodeSessionReference(reference)` from `@pixel-brewery/synapse-core` and restore it with `parseSessionReference(stored)`. Pass that original reference as the next request's `session`; do not extract the native ID and attach current ownership or credentials. The runtime checks the complete binding under the execution lease before launching the provider.

Every emitted session reference carries a generation. Before any recorded account or configuration transition, the runtime derives a deterministic initial generation from the profile's native storage and owner. Login, logout and explicit credential imports persist a fresh generation before native mutation; changes to explicit credential/configuration sources also invalidate older continuations across application restart. A failed metadata write prevents native mutation or execution. Native OAuth token-refresh files are outside the explicit configuration digest, which contains no credential plaintext.

`parseSessionReference` returns `undefined` for a pre-Synapse raw native ID. A migration adapter may reconstruct its known original driver/instance/profile/candidate binding while leaving the generation absent; the runtime accepts that legacy reference only before the first credential or configuration transition. Never stamp a current generation onto a legacy ID. Malformed versioned references fail as `session-unavailable`; unknown versions fail as `configuration` so an older host preserves newer persisted state.

## Explicit authentication

No import, constructor, inspection or run silently initiates login. To start an authorized native login, select an actually advertised `driver.auth.methods(instance)` entry and call `auth.start(instance, driver.auth, { ownerId, methodId })`. Present the flow's browser/device/terminal instructions and respond using its owner, operation and interaction IDs. Treat response values as secrets. `result` succeeds only after the native status check confirms the profile's account state.

Runtime configuration and each authentication entry point capture detached instance data before selecting the profile gate. Later host mutations of account IDs, paths, environment or configuration cannot redirect a queued operation to a different profile. `snapshotAiInstance` exposes the same explicit data-boundary operation for host integrations.

Use the same `runtime.access` coordinator for AuthManager. Login/logout/account changes reserve the profile, cancel and drain its affected executions, reject stale responses and block new admission. Two applications/accounts use separate profiles. Explicit legacy path mappings preserve existing native accounts and sessions; global credential import is always a distinct host action.

Wrap any host-managed native credential mutation, including `importOpenCodeCredentials`, in `runtime.access.credentialChange(instance.profile, action)`. This shares the execution drain and persistent session invalidation used by AuthManager; a generic exclusive lock alone does not advance the generation.

Native subscription methods depend on the installed provider CLI. API keys are optional explicit inputs and are not a library prerequisite. ACP has no universal authenticated-account check; inject a verified native auth adapter and trustworthy native mode mappings when needed.

## Independent meeting-text example

`apps/meeting-notes` is an unpublished Node CLI consuming only publishable Synapse imports and Node builtins. Its host-owned prompt converts a fixed synthetic transcript into `{ summary, decisions, tasks }`. No audio, Symphony, Electron or repository is involved.

```sh
yarn nx run meeting-notes:build --parallel=1
yarn workspace @pixel-brewery/synapse-meeting-notes-example start --simulate
yarn workspace @pixel-brewery/synapse-meeting-notes-example start --provider codex --account personal --login
```

`--simulate` is explicit, declares that no inference occurred and exercises real runtime/schema validation using a supplied fixture. Native provider failure is never replaced by that fixture. Without `--login`, the example uses only existing isolated native credentials.

## Package and bundle evidence

`yarn packaging:verify` packs all nine libraries, installs those archives in a temporary consumer and validates advertised runtime/declaration exports with NodeNext. It rejects workspace-only dependencies, compiler state, specs and CommonJS output in public artifacts. A separate import process blocks process launches, directory/file searches, network calls, timers and global listeners while permitting Node's ordinary module loading.

Codex-only consumers are actually bundled by esbuild and Rollup. Their rendered module contributions must exclude Claude, OpenCode and ACP implementations. The same temporary consumer executes the standalone meeting example against installed tarballs with explicit simulation and a private temporary profile root. Successful archives and a machine-readable evidence report are written under ignored `artifacts/` for local integration; publication is a separate owner action.

Generated API Markdown and reflection JSON are described in [API documentation](api-documentation.md). Keep generated public references aligned with the exact package exports before release.

For account-dependent schema, native resume, cancellation, reuse and isolation checks, see [native verification](native-verification.md). It never starts login or replaces a native failure with simulation.
