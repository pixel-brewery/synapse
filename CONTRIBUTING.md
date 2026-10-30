# Contributing to Synapse

Synapse is a TypeScript library for applications that work with installed AI CLIs. Contributions can improve a driver, the shared runtime, authentication, routing, tests or documentation. Start with the [documentation hub](.docs/README.md) and use a small reproducible example when reporting a problem. Sensitive reports follow [SECURITY.md](SECURITY.md).

The public source is [pixel-brewery/synapse](https://github.com/pixel-brewery/synapse), under the [Pixel Brewery organization](https://github.com/pixel-brewery). Pull-request creation is restricted to collaborators. Repository administration, history replacement and package publication remain owner actions; collaborators submit focused pull requests.

## Set up a checkout

Create a focused branch and install from the checkout root. Public source can be read and forked without contribution access, but opening a pull request requires collaborator access. Use Node.js **24.15.0 or later** and the Yarn version pinned by `packageManager` in [package.json](package.json), currently **4.18.1**.

```sh
corepack enable
yarn install --immutable
```

Personal AI accounts and installed provider CLIs are not needed for ordinary development checks. Unit tests use controlled child processes, simulated drivers and sanitized protocol replays. The [meeting-text example](apps/meeting-notes/README.md) offers explicit simulation; native login and inference are separate, deliberately invoked integration checks.

The shared developer commands follow Archipel's repository workflow:

| Command           | Purpose                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `yarn run update` | Choose dependency updates through Yarn's interactive upgrade screen.                |
| `yarn prepare`    | Format the checkout, then run lint and tests.                                       |
| `yarn spell`      | Check authored source, documentation and configuration with the project dictionary. |
| `yarn verify`     | Run all repository quality gates, including spelling.                               |

Dependency updates are selected explicitly; adding the command does not upgrade existing dependencies. Generated documentation, byte-preserved upstream architecture foundations and generated agent mirrors are excluded from spelling checks. Maintain Synapse terminology in `cspell.words.txt` and keep synthetic fixture exceptions scoped in `cspell.config.mjs`.

To activate the tracked commit checks in your checkout, run `yarn exec husky` once after installation. The pre-commit hook runs lint-staged serially on staged authored files, and the commit-message hook validates Conventional Commits. The `prepare` command remains the explicit format/lint/test shortcut used by Archipel. CI runs the complete quality gates independently of local hooks; Dependabot configuration covers weekly dependency and GitHub Actions updates.

## Automated dependency updates

Dependabot checks npm dependencies and GitHub Actions weekly. TypeScript is excluded and stays a deliberate maintainer update. Other major, minor and patch updates can be merged automatically after the complete `Verify` matrix succeeds on Linux, macOS and Windows, including `yarn verify` and `yarn packaging:verify`.

The merge workflow accepts only current same-repository Dependabot PRs targeting `main`. It checks the canonical CI workflow, its latest attempt, every matrix result and the unchanged PR revision before requesting a squash merge. Failed, skipped or missing jobs leave the PR open. Existing branch rules still apply. The privileged workflow executes only the default-branch helper; it does not execute PR code, install dependencies or consume PR artifacts.

When `main` changes, the refresh workflow asks Dependabot to rebase outdated PRs. Requests are limited to one per PR and main revision. Dependabot recalculates its dependency changes and lockfile, and the updated PR triggers CI again. It retains control of its branch; manually edited bot PRs may require maintainer attention. The workflow does not recreate PRs or discard manual edits.

A successful bot merge explicitly dispatches the normal package release and refresh workflows because pushes made with `GITHUB_TOKEN` do not start ordinary push workflows. Publication finishes with a GitHub Release and another Dependabot refresh for the generated version commit. Human PR merges to `main` start the same release and refresh paths through their push events. Package operations use the short-lived `GITHUB_TOKEN`; an existing `PACKAGES_TOKEN` secret is an optional override. Only the final atomic release commit/tag push uses installed release App `5547670`. Its main-rule exception, main-only credential environment and package publication have been exercised by a successful Synapse release. Each candidate still needs its own complete checks and registry verification. See the [release guide](.docs/guides/releases.md#main-protection-and-release-app-prerequisites).

## Find the owner and change it

Read [Synapse Architect](.agents/skills/synapse-architect/SKILL.md), including its project, source, testing and documentation references. It is the canonical architecture and engineering contract. The [architecture guide](.docs/architecture/synapse.md) explains package responsibilities and what stays in consuming applications.

Keep a change with its owning package and adjacent tests. Public contracts need English TSDoc describing behavior, defaults, errors, ownership and lifecycle; update examples and migration guidance when those contracts change. Add a replay or regression for a real boundary such as cancellation, profile isolation, authentication, session ownership, structured results or retry behavior. Use synthetic prompts and remove private account data from fixtures.

Run `yarn format` for source layout and Prettier formatting. The syntax-aware layout step normalizes actual documentation, nonempty regions and logical spacing while preserving literal/fixture text; it rejects changes to executable syntax. `yarn source:check` checks this layout along with package, declaration and public API rules. The exact conventions live in [the architect's source contract](.agents/skills/synapse-architect/references/source.md).

Add real workspace dependencies through Yarn. Public package imports must resolve through package exports and built declarations; source-path aliases would hide packaging defects. A new provider should fit the existing driver contract without introducing a central provider enum or registration side effect.

[AGENTS.md](AGENTS.md) identifies canonical AI instructions and generated client files. If those sources or MCP configuration change, run `yarn agents:sync` and then `yarn agents:check`. Edit the canonical files rather than generated mirrors.

## Verify the change

Run the owning Nx targets first. For example, a runtime change uses:

```sh
yarn nx run synapse-runtime:lint --parallel=1
yarn nx run synapse-runtime:typecheck --parallel=1
yarn nx run synapse-runtime:test --parallel=1
```

When public declarations or comments change, regenerate the [API reference](.docs/guides/api-documentation.md):

```sh
yarn docs
yarn docs:check
```

Before handing over a candidate, run the repository checks:

```sh
yarn verify
yarn packaging:verify
```

`yarn verify` checks agent/source conventions, formatting, lint, types, tests, builds and generated API drift. Artifact verification builds and installs real package archives in a separate consumer, checks declarations and inert imports, and exercises esbuild/Rollup provider exclusion and the simulated meeting example. It may fetch ordinary package dependencies; it does not log in to an AI account or run live inference.

The [CI workflow](.github/workflows/ci.yml) configures Node.js 24 on Linux, macOS and native Windows. Report which platforms actually ran and which checks were skipped. A local pass on one operating system does not establish the others. The [release guide](.docs/guides/releases.md) distinguishes candidate evidence from publication readiness.

## Submit a focused pull request

Explain the observable problem, resulting behavior and relevant compatibility changes. Include exact verification commands and outcomes, with anything not run stated explicitly. Describe changes to public exports, stored sessions/profile metadata or CLI assumptions so reviewers can assess consumer impact.

The active `main` policy requires every human change to use a PR with successful `verify (ubuntu-latest)`, `verify (macos-latest)` and `verify (windows-latest)` checks. Required approving reviews are zero for the sole maintainer, `RueDeRennes`, and PR creation is limited to collaborators. Only release App `5547670` bypasses the PR/check rule. Force-push and deletion prevention have their own main-only rule without bypasses. No general administrator, human or all-Actions exception is part of this policy.

Commit authored documentation and regenerated API artifacts together. Keep credentials, native CLI state, private transcripts, machine-specific paths and temporary archives out of the patch. Package publication, coordinated version changes and tags belong to the release owner; an ordinary contribution does not require them.

Use `yarn release:dry-run:local` to preview the next patch version and changelog. The existing real `:local` runners push with a human Git identity and are incompatible with the active PR-only main policy. Real releases use the main-branch workflow or `yarn release`, `yarn release:patch`, `yarn release:minor` or `yarn release:major` dispatch under the [configured App contract](.docs/guides/releases.md#main-protection-and-release-app-prerequisites). The App key belongs only in the main-only `release-main` environment, with no per-release reviewer or wait requirement; it must not be a repository/organization secret or be copied into a local runner.
