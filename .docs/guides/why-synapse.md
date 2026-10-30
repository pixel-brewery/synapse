# Why Synapse exists

Local applications should be able to work with the AI tools their users already run. A desktop application, a background utility and a small command-line tool can all need the same integration: ask a selected CLI to do a job, observe progress and recover the result.

The prompt is usually the easy part. The reusable work is everything around it.

## From one subprocess to an application feature

The first integration starts an executable and reads its output. Then the application adds another account. A user switches credentials during a run. A session is resumed after a restart. A provider hits a quota limit. A cancelled process has children that must also stop. A fallback might repeat a file write that already happened.

Those events are part of a normal application lifecycle. If each tool implements them independently, the same edge cases spread across several codebases.

Synapse grew out of extracting this boundary from Symphony, a local desktop orchestration platform. The goal is to reuse that work in independent applications while preserving their own product decisions.

## The boundary we chose

The application owns the user's task: prompts, business rules, approvals, model catalog policy, storage and presentation. Synapse owns the selected CLI integration: native sign-in, application/account profiles, execution, session references, cancellation and optional routing.

Three choices shape the library:

- **Account state has an owner.** Profiles belong to an application and account. Native login is deliberate. Credential changes coordinate with active work and advance the authentication generation used to validate future session resumes.
- **A run has a lifecycle.** One result promise and a bounded event stream describe the same execution. Deadlines, cancellation and disposal include owned process cleanup. Unconfirmed termination is an explicit failure that keeps the affected profile blocked in the current coordinator.
- **A retry is a product decision.** Routing can choose candidates, queue work and respect quota pauses. Automatic failover requires a repeatable request; writing work needs an additional opt-in. Cancellation and failed host persistence do not start another provider run.

The host composes only the packages and drivers it needs. Core contracts are free of Node.js and provider dependencies; native process details live at the runtime boundary. Imports do not discover executables, launch processes, authenticate or connect to a service.

## One library, different applications

In Symphony, domain services still create analysis, implementation and issue prompts, preserve workspace rules and own SQLite persistence. Synapse supplies the native AI execution underneath that facade.

In the [standalone meeting-text example](../../apps/meeting-notes/README.md), a small Node application supplies a synthetic transcript and a schema for a summary, decisions and tasks. The same packages run without Symphony, Electron or a Git repository. A future meeting application would still own audio capture, transcription choices, retention and its user interface.

Other local tools can define entirely different prompts and workflows. They reuse the CLI lifecycle without acquiring a desktop application's architecture.

## A deliberate place in the ecosystem

Synapse's advantage is the combination of application-owned profiles, coordinated credential changes, persistent session binding and policy-controlled routing behind explicitly composed CLI adapters. It is designed for hosts where those requirements matter together.

That does not make every alternative interchangeable or inferior. Agents Wire emphasizes broad agent coverage and orchestration; Coding Agent Runner offers a small execution surface; Unigent centers typed functions and workflows. AI SDK community adapters fit applications built around that SDK's model interface. The [detailed comparison](comparison.md) makes those choices explicit with primary sources and unverified items.

Native subscription sign-in removes a mandatory library API-key requirement where the selected CLI supports it. It does not make every backend keyless, move inference onto the local machine or change a provider's account terms.

## What is ready, and what comes next

The initial family includes nine runtime libraries, Codex/Claude Code/OpenCode drivers, an ACP extension point and an optional MCP documentation CLI. Generated API documentation and independent archive-consumer verification support the shared initial version `0.0.1`.

The MIT-licensed source is being prepared for public hosting at [pixel-brewery/synapse](https://github.com/pixel-brewery/synapse), with repository transfer and visibility completed by the owner through the [public source launch](releases.md#public-source-launch). The ten packages target public GitHub Packages, with registry authentication required even for public npm packages there. Install a published family after exact-version and visibility verification; local checkouts and verified archives remain useful for evaluation. Source access and package installation have separate launch checks.

Local macOS checks and the Symphony integration gates have run. The configured Linux/native Windows CI jobs and explicitly initiated live-account checks still need evidence for the selected candidate. See [CLI compatibility](cli-compatibility.md) and [release preparation](releases.md) for that distinction.

Start with the [main README](../../README.md), [consumer guide](consumers.md) or [package and API index](../README.md#packages-and-api-reference).
