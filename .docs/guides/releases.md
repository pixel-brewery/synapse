# Coordinated releases to GitHub Packages

The family version is recorded in the committed package manifests. Registry availability is established by exact-version and public-visibility verification, rather than by a prepared manifest, archive or workflow. The MIT-licensed source is being prepared for public hosting at [pixel-brewery/synapse](https://github.com/pixel-brewery/synapse), under the [Pixel Brewery organization](https://github.com/pixel-brewery). All ten packages target **public visibility on GitHub Packages** at `https://npm.pkg.github.com` under `@pixel-brewery`. Repository transfer, source visibility and package publication have separate owner actions and verification. Package publication uses GitHub Packages.

## Public source launch

Repository metadata and source links target `pixel-brewery/synapse`. The owner must complete and verify the live repository transfer and public visibility change; updating this checkout prepares those steps.

Before changing visibility, select the reviewed launch tree and prepare a clean snapshot for a fresh initial commit with no parent. Keep a private backup outside the repository and preserve the current checkout and remote history until the owner approves the launch operation. Initializing a new Pixel Brewery repository from that snapshot provides a source history containing only the reviewed initial commit. Reusing the existing repository requires separate review: replacing branch and tag refs does not establish deletion of old objects, pull-request refs or cached commits. Old branches and tags must not carry the previous history into the public repository. Review the launch tree, public refs and distributable artifacts for credentials, native account state, private transcripts and developer-specific paths. Historic attribution, copyright notices and upstream provenance remain part of the source.

Complete the repository handover under Pixel Brewery, retaining `@RueDeRennes` as the personal CODEOWNER and granting `RueDeRennes` write access for contributions to `main`. No organization team is required by this setup. Review the organization's default branch, branch rules, required reviews/checks, Actions contribution policy, release permissions and existing secrets/environments. Configure the package-owner credential separately from repository Git/release authority, and enable GitHub private vulnerability reporting for sensitive reports as described in [SECURITY.md](../../SECURITY.md).

After the owner completes the transfer and public launch, verify the canonical repository, issue links and repository-hosted documentation through `https://github.com/pixel-brewery/synapse`. Verify package versions and package visibility independently using the commands below. Keep the actual launch revision and completed checks with the release evidence.

## One package family

The fixed `synapse` release group contains nine runtime libraries in `libs/synapse-*` and the optional `synapse-mcp` CLI in `tools/mcp`. They share one version. The unpublished workspace root and meeting-text example are outside the published group.

The MCP CLI starts `dist/main.js` through its `synapse-mcp` bin and exports only `./package.json`. Its bundled `dist/data/corpus.json` contains the nine libraries' recursive API references, guides and patterns. It adds no public TypeScript library entrypoint or dependency to the runtime libraries.

The TypeDoc API surface remains nine libraries. Regenerate it explicitly with `yarn docs` after changing source documentation or package versions; the MCP build checks drift before building its corpus. Do not hand-edit generated API or corpus files.

## First publication and verification

The first main workflow run without a stable release tag completes the committed prepared family version, currently `0.0.2`, through Nx's first-release mode. Once stable tags exist, subsequent workflow runs apply the selected `patch`, `minor` or `major` increment. Local increment commands keep their selected SemVer behavior and use the committed disk version as their baseline when tags are absent. Removing Git history must preserve the version baseline and never reset the published version counter. The publisher requires a checkout whose HEAD exactly matches `v<prepared-version>` and has no tracked changes. From that prepared release tag, publish or resume the same family and verify it with:

```sh
yarn release:publish
yarn release:verify
```

`release:publish` publishes the prepared version without another version bump and builds its Nx prerequisites automatically. It is also the recovery command when only part of that same family reached the registry. It must retain the selected version and complete the missing publications instead of creating another release.

`release:verify` checks that every selected package exists at its exact prepared version and that all ten GitHub package ACLs are public. A successful upload alone is insufficient. GitHub initially creates packages with private visibility, and package visibility is distinct from repository visibility. The package owner sets the intended visibility; the publisher does not change package ACLs, and the verification command confirms the result. See [GitHub package visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

Use the published version only after those registry/version/visibility checks succeed. Record the actual local command or workflow run and candidate revision with the result.

The GitHub release workflow downloads the exact published versions and runs `yarn release:verify` before creating the GitHub release. This verifies the entire family's exact versions, latest tags, exposed source metadata and public package ACLs. The package owner must set public visibility when initially creating a package; later versions of the existing public family retain that visibility. The local release runner invokes the same verifier and fails if the intended visibility is absent.

## Local releases

Release owners can run the full release from the checkout with the `:local` commands. Each command stays in the calling process through preparation, verification and publication:

| Command                      | Behavior                                      |
| ---------------------------- | --------------------------------------------- |
| `yarn release:local`         | Release the next patch version.               |
| `yarn release:patch:local`   | Release the next patch version explicitly.    |
| `yarn release:minor:local`   | Release the next minor version.               |
| `yarn release:major:local`   | Release the next major version.               |
| `yarn release:dry-run:local` | Preview the next patch version and changelog. |

The increments retain their literal SemVer meaning for `0.x` versions: a minor increment of `0.0.1` produces `0.1.0`, and a major increment produces `1.0.0`.

A real run requires a clean `main` checkout containing the current `origin/main`, authenticated Git access and the package-owner credentials described [below](#registry-authentication-and-source-access). Committed local changes may be ahead of `origin/main`; the final atomic push includes them with the release commit, so no preliminary push is needed. The runner uses the fixed Nx release group to update the ten package versions, lockfile and changelog. It then regenerates the versioned API documentation, formats `CHANGELOG.md`, and runs `yarn verify` and `yarn packaging:verify`. After those checks pass, it creates one release commit and version tag, pushes both atomically, publishes through the existing publisher and verifies the exact registry versions and public package visibility.

If the selected version and generated files are already prepared, the runner creates one empty release commit after verification. Its configured `[skip ci]` message prevents the local release push from starting a competing main-branch release. It still checks the current main revision and remote tag before the atomic push.

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

Choose one release entry point: the local runner or the existing main-branch workflow. Both own version preparation, verification, changelog and Git steps for their release. A direct registry command or an independent version edit does not replace those steps. The existing `release`, `release:patch`, `release:minor` and `release:major` commands continue to dispatch the asynchronous workflow.

Dependabot PRs use the [dependency automation](../../CONTRIBUTING.md#automated-dependency-updates): the current canonical `Verify` PR run must finish all three platform jobs successfully before the unchanged PR can be merged. The merge workflow explicitly dispatches the patch release because a merge made with `GITHUB_TOKEN` does not trigger the usual main push workflow. Human merges start the release through their normal push event. The refresh workflow requests a Dependabot rebase after main changes; the release workflow requests another refresh after publishing its version commit and GitHub Release. Updated bot revisions must pass CI again before merging.

Synapse publishes library archives and a GitHub Release for each completed family version. A consuming desktop application owns its own version, Squirrel update assets and GitHub release feed. A Synapse package update becomes available to that application through its dependency update and application release pipeline; this library does not produce desktop installers or Squirrel assets.

Both paths push the release commit directly to `main`. Before enabling rules that require every update to use a pull request, the owner must choose a compatible release strategy, such as a reviewed release pull request or an explicitly authorized bot bypass. The current workflow's default `github.token` does not automatically satisfy required-pull-request rules. Confirm that the selected strategy permits the atomic release push while preserving the intended contribution reviews.

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

The release job runs unattended after the complete verification matrix and requires `refs/heads/main`. It does not select a GitHub environment: private repositories on GitHub Free cannot use environments, and publication does not require a separate manual approval. If the owner later adds an environment gate, configure its branch and approval rules explicitly and account for the resulting publication pause. Contribution verification declares read-only repository permissions, disables persisted checkout credentials and implicit package-manager caching, and uses commit-pinned official Actions.

The trusted release job retains a repository write credential for the atomic Git push. Its preparation and verification commands therefore run with repository write authority. During the publishing step, `release:publish` and its build dependencies inherit the package credential. Maintainers must review dependency and workflow changes before merging them into the trusted main branch.

Local releases use the existing Git authentication and package-owner credentials consumed by `release:publish` and `release:verify`. Supply existing `NODE_AUTH_TOKEN`, `GH_TOKEN` or `GITHUB_TOKEN` credentials with the required package access, or use the already authenticated GitHub CLI account. The local runner does not initiate login or change credential configuration.

Registry credentials allow package installation/publication. Native Codex, Claude Code or OpenCode login is a separate runtime concern; installing Synapse does not sign in to an AI provider, and an AI subscription login does not authenticate the package registry.

The public source launch makes repository URLs, issues and repository-hosted guides accessible under `pixel-brewery/synapse`. Reading public source requires no package-registry credential; installing public GitHub npm packages still requires registry authentication. The optional MCP archive carries its documentation corpus independently and needs no checkout or documentation website after installation. See [consumer installation](consumers.md#install-from-github-packages) and the [MCP guide](mcp.md).
