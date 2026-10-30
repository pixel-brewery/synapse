# Explicit local native-provider verification

`yarn native:verify` runs an account-dependent integration check against one installed Codex, Claude Code or OpenCode CLI. The command requires `--provider`, an absolute `--profile-root` and an explicit test `--account`. Use a dedicated profile store and test account that you have deliberately authenticated.

The default application ID is `synapse-meeting-notes-example`, matching the [meeting-text example](../../apps/meeting-notes/README.md). Its explicit `--login` can therefore prepare the same profile. Native verification does not initiate login, import global credentials, install a CLI or substitute a simulation. It may consume the selected account's inference quota.

## What the command proves

Every listed check must pass. A failure ends the run with a nonzero exit code; there are no silent skips.

| Check                      | Required observation                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth-status`              | The selected profile's native auth adapter reports authenticated. For OpenCode this identifies matching stored credentials; the following inference checks also exercise their actual usability.                                                                                     |
| `schema-json`              | A read-only request returns locally schema-validated JSON containing an exact synthetic nonce.                                                                                                                                                                                       |
| `bound-resume`             | The next request receives the original complete session reference and returns the preceding nonce. The follow-up prompt and schema omit the nonce.                                                                                                                                   |
| `active-cancellation`      | A fresh read-only request emits native normalized session, progress or text output while its native process-transport call is still open, then receives an abort. Its result rejects as cancelled after owned cleanup. A request that merely finishes or times out fails this check. |
| `reuse-after-cancellation` | A subsequent request through the same runtime, runner and account succeeds with schema-validated JSON.                                                                                                                                                                               |
| `profile-isolation`        | A second application/account profile has a different identity and reports signed out. Its deterministic IDs append `-isolation` to the selected application and test account.                                                                                                        |
| `foreign-session-rejected` | The runtime rejects the first profile's complete session reference when addressed to the second profile.                                                                                                                                                                             |
| `logout-verified`          | Only when `--logout` is supplied: the native logout completes and a subsequent native status check reports signed out.                                                                                                                                                               |

One `ProfileAccessCoordinator` is shared by the auth manager and runtime. Requests use the profile's owned execution directory, preserving a stable native working directory across resume without requiring Git. Each inference request has a two-minute deadline; the full run has a ten-minute budget. Native auth status has a ten-second budget. Ctrl+C or SIGTERM aborts the run, and `finally` awaits disposal of auth work, runtime work and owned processes. Cleanup uncertainty is a failure.

The final JSON report contains the selected provider/application/test-account label, platform, Node version, completion time and completed check names. It excludes credentials, native session references and the nonce. Keep the report with the exact installed CLI version when recording compatibility evidence.

## Prepare and run on macOS or Linux

Use Node.js 24.15.0 or later, the repository's configured Yarn and an explicitly installed supported CLI. See [characterized CLI interfaces](cli-compatibility.md). Build the local packages and meeting example first:

```sh
yarn build
```

For Codex, these commands use an absolute dedicated store and a deliberately named test profile. The first command opens the supported explicit native login flow and then runs the meeting-text example. The second performs the native integration checks against that same profile:

```sh
PROFILE_ROOT="$HOME/.local/share/synapse-native-verification"

yarn workspace @pixel-brewery/synapse-meeting-notes-example start \
    --provider codex \
    --profile-root "$PROFILE_ROOT" \
    --account native-test \
    --login

yarn native:verify \
    --provider codex \
    --profile-root "$PROFILE_ROOT" \
    --account native-test
```

For Claude Code, explicitly prepare its separately owned profile and run the same checks:

```sh
PROFILE_ROOT="$HOME/.local/share/synapse-native-verification"

yarn workspace @pixel-brewery/synapse-meeting-notes-example start \
    --provider claude \
    --profile-root "$PROFILE_ROOT" \
    --account native-test \
    --login

yarn native:verify \
    --provider claude \
    --profile-root "$PROFILE_ROOT" \
    --account native-test
```

For OpenCode, select the actual provider, native subscription login-method label and model supported by your installed CLI/account. Enter those exact values when prompted below. The login label is required by the meeting example's explicit native login; verification only needs the matching provider/model configuration:

```sh
PROFILE_ROOT="$HOME/.local/share/synapse-native-verification"

printf 'OpenCode provider ID: '
read -r OPENCODE_PROVIDER
printf 'Exact native subscription login-method label: '
read -r OPENCODE_METHOD
printf 'Enabled provider/model ID: '
read -r OPENCODE_MODEL

yarn workspace @pixel-brewery/synapse-meeting-notes-example start \
    --provider opencode \
    --profile-root "$PROFILE_ROOT" \
    --account native-test \
    --opencode-provider "$OPENCODE_PROVIDER" \
    --opencode-method "$OPENCODE_METHOD" \
    --model "$OPENCODE_MODEL" \
    --login

yarn native:verify \
    --provider opencode \
    --profile-root "$PROFILE_ROOT" \
    --account native-test \
    --opencode-provider "$OPENCODE_PROVIDER" \
    --model "$OPENCODE_MODEL"
```

If login is already prepared in the same profile, run only the verification command. An optional `--model` on the verifier selects a native model for all inference checks. Its value must be available to the chosen account.

## Prepare and run on native Windows

In PowerShell, use a dedicated absolute path derived from `LOCALAPPDATA`. Install/select the native Windows CLI explicitly, then build and prepare the profile:

```powershell
yarn build
$profileRoot = Join-Path $env:LOCALAPPDATA 'Synapse\native-verification'

yarn workspace @pixel-brewery/synapse-meeting-notes-example start `
    --provider codex `
    --profile-root "$profileRoot" `
    --account native-test `
    --login

yarn native:verify `
    --provider codex `
    --profile-root "$profileRoot" `
    --account native-test
```

Select `claude` for its independently authenticated profile. For OpenCode, supply the same explicit `--opencode-provider` and `--model` values used during preparation, plus `--opencode-method` on the meeting login command.

These commands enable native Windows verification; their presence does not establish a completed Windows run. Record the actual OS, Node version, CLI version and resulting report for each tested environment.

## Optional logout and custom application ownership

Append `--logout` to a verification command to remove and verify the selected test profile's native authentication after the other checks. The profile remains signed in when that flag is absent. Logout can invalidate its previous session references. A subsequent run then requires another explicit login.

`--application-id` selects a different application namespace. The current meeting example always uses `synapse-meeting-notes-example`; a custom namespace therefore needs authentication prepared explicitly by a host using that same application ID, provider, profile root and account. The verifier will fail with `auth-required` until that profile is ready.

## Account-free evidence and live evidence

The adjacent `tools/verifyNativeProvider.spec.mjs` exercises the check logic using the real `AiRuntime`, `AuthManager`, `ProfileManager` and shared coordinator with an explicitly controlled driver. It verifies schema/resume ownership, nonce omission, cancellation cleanup, subsequent reuse, isolation, optional logout and failure handling. A separate inert-import probe rejects import-time processes, discovery, network, timers and signal listeners. These tests require no personal AI account and perform no native inference.

A passing controlled test or packed-artifact check does not establish a live CLI login, provider response or operating-system result. Only an explicitly invoked successful native command against an authenticated test profile supplies that additional evidence. The ordinary `yarn verify` suite never invokes the live verifier. Run each provider and each target OS separately when collecting compatibility evidence.
