# Coordinated releases to GitHub Packages

The family version is recorded in the committed package manifests. Registry availability is established by exact-version and public-visibility verification, rather than by a prepared manifest, archive or workflow. The MIT-licensed source is public at [pixel-brewery/synapse](https://github.com/pixel-brewery/synapse), under the [Pixel Brewery organization](https://github.com/pixel-brewery). All ten packages target **public visibility on GitHub Packages** at `https://npm.pkg.github.com` under `@pixel-brewery`. Repository visibility, branch protection and package publication have separate owner actions and verification. Package publication uses GitHub Packages.

## Public source launch

Repository metadata and source links target the public `pixel-brewery/synapse` repository. Pull-request creation is restricted to collaborators. The separate main PR/check rule and history-preservation rule are active; their release authority contract is described below.

Any separately authorized history replacement must preserve the reviewed source tree and keep a private recovery copy outside the repository. Replacing branch and tag refs alone does not establish deletion of old objects, pull-request refs or cached commits. Old branches and tags must not reintroduce retired history. Review public refs and distributable artifacts for credentials, native account state, private transcripts and developer-specific paths. Historic attribution, copyright notices and upstream provenance remain part of the source.

Retain `@RueDeRennes` as the personal CODEOWNER and maintainer with write access. Human source changes use a branch and pull request rather than a direct push to `main`. No organization team is required by this setup. Configure package publication separately from the release App's Git authority, and maintain private vulnerability reporting for sensitive reports as described in [SECURITY.md](../../SECURITY.md).

Verify package versions and package visibility independently using the commands below. Keep the actual candidate revision, workflow run and completed checks with the release evidence. Source configuration is not proof that an App installation, branch rule or release has completed.

## One package family

The fixed `synapse` release group contains nine runtime libraries in `libs/synapse-*` and the optional `synapse-mcp` CLI in `tools/mcp`. They share one version. The unpublished workspace root and meeting-text example are outside the published group.

The MCP CLI starts `dist/main.js` through its `synapse-mcp` bin and exports only `./package.json`. Its bundled `dist/data/corpus.json` contains the nine libraries' recursive API references, guides and patterns. It adds no public TypeScript library entrypoint or dependency to the runtime libraries.

The TypeDoc API surface remains nine libraries. Regenerate it explicitly with `yarn docs` after changing source documentation or package versions; the MCP build checks drift before building its corpus. Do not hand-edit generated API or corpus files.

## First publication and verification

The first main workflow run without a stable release tag completes the committed prepared family version through Nx's first-release mode. Once stable tags exist, subsequent workflow runs apply the selected `patch`, `minor` or `major` increment. Local previews keep their selected SemVer behavior and use the committed disk version as their baseline when tags are absent. Removing Git history must preserve the version baseline and never reset the published version counter. The publisher requires a checkout whose HEAD exactly matches `v<prepared-version>` and has no tracked changes. From that prepared release tag, an authorized owner can publish or resume the same family and verify it with:

```sh
yarn release:publish
yarn release:verify
```

`release:publish` publishes the prepared version without another version bump and builds its Nx prerequisites automatically. It is also the recovery command when only part of that same family reached the registry. It must retain the selected version and complete the missing publications instead of creating another release.

`release:verify` checks that every selected package exists at its exact prepared version and that all ten GitHub package ACLs are public. A successful upload alone is insufficient. GitHub initially creates packages with private visibility, and package visibility is distinct from repository visibility. The package owner sets the intended visibility; the publisher does not change package ACLs, and the verification command confirms the result. See [GitHub package visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

Use the published version only after those registry/version/visibility checks succeed. Record the actual local command or workflow run and candidate revision with the result.

The GitHub release workflow downloads the exact published versions and runs `yarn release:verify` before creating the GitHub release. This verifies the entire family's exact versions, latest tags, exposed source metadata and public package ACLs. The package owner must set public visibility when initially creating a package; later versions of the existing public family retain that visibility. The local release runner invokes the same verifier and fails if the intended visibility is absent.

## Local releases

Use local commands for previews. The real `:local` runners remain in the source, but they push to `main` using the caller's Git identity and are incompatible with the active human PR-only policy. They do not obtain the release App's bypass. Use the CI dispatch commands for real releases under the configured App and protection contract below.

| Command                      | Behavior under the active main policy                                    |
| ---------------------------- | ------------------------------------------------------------------------ |
| `yarn release:dry-run:local` | Preview the next patch version and changelog without a push.             |
| `yarn release:local`         | Existing direct-push patch runner; use CI dispatch for real publication. |
| `yarn release:patch:local`   | Existing direct-push patch runner; use CI dispatch for real publication. |
| `yarn release:minor:local`   | Existing direct-push minor runner; use CI dispatch for real publication. |
| `yarn release:major:local`   | Existing direct-push major runner; use CI dispatch for real publication. |

The increments retain their literal SemVer meaning for `0.x` versions: a minor increment of `0.0.1` produces `0.1.0`, and a major increment produces `1.0.0`.

The existing real runner prepares versions, documentation and changelog, verifies archives, creates a commit/tag and attempts an atomic human-authenticated push before publication. Those local checks do not satisfy a pull-request requirement. Do not grant a human or administrator bypass, or distribute the App key locally, to preserve that route. Merge source changes through their verified PR, then let the main workflow run or dispatch it explicitly.

Use `yarn release:minor:local --dry-run` or `yarn release:major:local --dry-run` to preview another increment. Preview mode may read local Git tags to select first-release behavior, then uses Nx's native version/changelog preview. It does not fetch, look up credentials, generate documentation, build, mutate Git, publish or dispatch Actions.

If publication stops after uploading part of the family, resume with `yarn release:publish` from the same prepared tag, then run `yarn release:verify`. Keep that version and tag; another `:local` release command would request a new version.

## Subsequent releases through main

Future releases follow Symphony's release shape:

- A normal push to `main` requests a patch release of the fixed ten-package family.
- A manually dispatched release workflow selects `patch`, `minor` or `major` for the same family.
- `yarn release` and `yarn release:patch` dispatch the patch workflow; `yarn release:minor` and `yarn release:major` dispatch the other manual increments.
- Release preparation updates the family versions, lockfile, generated documentation and `CHANGELOG.md` together.
- Candidate verification completes before the release commit and version tag are pushed atomically to `main` and the tag ref. Publication waits for the reusable macOS/Linux/Windows verification matrix.
- Publication and exact-version/public-ACL verification apply to that same prepared family. An incomplete publication is resumed with `release:publish`, without another bump.

The main-branch workflow is the real release entry point under the active PR policy. A direct registry command or an independent version edit does not replace its preparation and verification. The existing `release`, `release:patch`, `release:minor` and `release:major` commands dispatch that asynchronous workflow; local dry runs remain available without publication authority.

Dependabot PRs use the [dependency automation](../../CONTRIBUTING.md#automated-dependency-updates): the current canonical `Verify` PR run must finish all three platform jobs successfully before the unchanged PR can be merged. The merge workflow explicitly dispatches the patch release because a merge made with `GITHUB_TOKEN` does not trigger the usual main push workflow. Human merges start the release through their normal push event. The refresh workflow requests a Dependabot rebase after main changes; the release workflow requests another refresh after publishing its version commit and GitHub Release. Updated bot revisions must pass CI again before merging.

Synapse publishes library archives and a GitHub Release for each completed family version. A consuming desktop application owns its own version, Squirrel update assets and GitHub release feed. A Synapse package update becomes available to that application through its dependency update and application release pipeline; this library does not produce desktop installers or Squirrel assets.

## Main protection and release App prerequisites

The active policy applies only to `main`. Human changes require a pull request and these three successful contexts for its current revision: `verify (ubuntu-latest)`, `verify (macos-latest)`, and `verify (windows-latest)`. Required approving reviews are zero because `RueDeRennes` is the sole maintainer; the pull request and CI gates still apply. Deletion and non-fast-forward prevention use a separate main-only rule with no bypass actors. Only release App `5547670` bypasses the PR/check rule; administrators, maintainer roles and all-Actions actors have no general exemption. Tags and other branches are outside these main-only rules.

The native `GITHUB_TOKEN` is not the bypass identity. Private release App `5547670` is installed only for the public `pixel-brewery/synapse` and `pixel-brewery/symphony` repositories. An installation-token check confirmed exactly those two repositories and **Contents: read and write** plus the implicit **Metadata: read** permission. Repository variable `RELEASE_APP_ID` and environment secret `RELEASE_APP_PRIVATE_KEY` are configured in each repository. The key exists only in `release-main`, with no same-named repository or organization secret. Its custom deployment policy allows exactly type `branch`, name `main`, with no required reviewers or wait timer. Preserve this boundary during key rotation and settings changes; keep the private key out of source, logs and local runner configuration. YAML cannot distinguish the resolved secret's origin, so changes to the live installation, environment or rules require their own settings verification rather than relying on the environment name alone.

The release job selects `environment: release-main`. Only that job checks the App key's presence; when the key is scoped as required, earlier jobs cannot read it. It creates a short-lived installation token only after all candidate checks and final prepared-commit checks pass. The token request selects the current owner and this repository alone, with only `contents: write`. Only the final atomic fast-forward `main` and version-tag push receives that token. Checkout credentials are not persisted, and PR code, dependency installation, package publication, GitHub Release APIs and workflow dispatch do not receive the App token. Its bypass permits the already verified metadata commit to advance `main`; it is not an exemption from the workflow's source, tag, version or concurrency checks. Missing resolved App settings or a failed token request stops publication. No human/native-token fallback is implemented, and a broader secret of the same name is forbidden by the operator contract rather than detected by YAML.

Dependabot continues to merge only through its verified PR and the existing trusted helper; it does not use the release App. The generated release commit retains `[skip ci]`, and the workflow explicitly refreshes remaining Dependabot branches. Dependency merges and publication remain unattended; the App configuration adds no per-release approval.

The [completed Synapse release run](https://github.com/pixel-brewery/synapse/actions/runs/41130701417) exercised the App-authorized main/tag push and completed publication, exact-version downloads and public-visibility verification for the ten-package family. This proves that release path for that candidate, not every later candidate or Symphony's desktop publication. Every release still requires its own successful workflow and registry verification.

## Candidate evidence

Before publishing a candidate, run the configured gates against its actual sources and metadata:

```sh
yarn docs
yarn verify
yarn packaging:verify
```

`yarn verify` covers source conventions, agent configuration, formatting, lint, strict types, tests, builds and documentation drift. `yarn packaging:verify` installs real archives into an independent consumer: it checks library exports/declarations and inert imports, Codex-only esbuild/Rollup bundles, the simulated meeting-text example and the installed MCP CLI/corpus/stdio protocol. These are local candidate checks, not proof of registry publication.

Archives and the local report under `artifacts/` are ignored evidence. Their filenames include the prepared version; select the candidate's ten archives explicitly rather than publishing every historical archive left in that directory.

Development verification has run on macOS with Node.js 24.21.0. Node.js 24.15+ is the declared minimum, and CI targets macOS, Linux and native Windows. A configured job does not establish a completed platform run. Live CLI login/inference remains separately invoked for the chosen account, executable version and platform; ordinary tests need no personal AI accounts. Downstream Symphony verification belongs to that consumer's own gates.

## Registry authentication and source access

Public GitHub npm packages still require registry authentication. Consumers can use a personal access token (classic) with `read:packages`. The release job uses the short-lived `GITHUB_TOKEN` with `packages: write`. For each existing package, grant `pixel-brewery/synapse` the Write role under Package settings → Manage Actions access. This Actions grant is distinct from linking the package's source repository. An existing `PACKAGES_TOKEN` secret remains an optional override; no personal token is required for the normal workflow. See [GitHub's recommended workflow authentication](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions).

`NODE_AUTH_TOKEN` is supplied only to publication, download and published-version verification steps. `GH_TOKEN` is scoped to the GitHub release query/create and Dependabot refresh dispatch steps; the release job's `actions: write` permission allows that final dispatch. Follow the [GitHub npm registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry). Keep token values in the environment or credential store, never in tracked configuration or release output.

The release job runs unattended after the complete verification matrix, requires `refs/heads/main`, and uses the configured main-only `release-main` environment without manual reviewers or a wait timer. The environment is a credential boundary rather than a per-release approval gate. Keep the App key scoped there; there is no permitted repository-secret fallback. Contribution verification declares read-only repository permissions, disables persisted checkout credentials and implicit package-manager caching, and uses commit-pinned official Actions.

The short-lived release App credential is limited to the final atomic source/tag push described above. Package registry operations, GitHub Release APIs and Dependabot refresh dispatch continue to use their existing `GITHUB_TOKEN` or package-token boundary. During publication, `release:publish` and its build dependencies inherit the package credential. Maintainers must review dependency and workflow changes before merging them into the trusted main branch.

An authorized exact-tag registry recovery uses the existing package-owner credentials consumed by `release:publish` and `release:verify`, such as `NODE_AUTH_TOKEN`, `GH_TOKEN` or `GITHUB_TOKEN`, or the already authenticated GitHub CLI account. It does not push a new main commit or obtain the release App token. The local runner does not initiate login or change credential configuration; that fact does not make its direct human main push compatible with PR protection.

Registry credentials allow package installation/publication. Native Codex, Claude Code or OpenCode login is a separate runtime concern; installing Synapse does not sign in to an AI provider, and an AI subscription login does not authenticate the package registry.

The public source launch makes repository URLs, issues and repository-hosted guides accessible under `pixel-brewery/synapse`. Reading public source requires no package-registry credential; installing public GitHub npm packages still requires registry authentication. The optional MCP archive carries its documentation corpus independently and needs no checkout or documentation website after installation. See [consumer installation](consumers.md#install-from-github-packages) and the [MCP guide](mcp.md).
