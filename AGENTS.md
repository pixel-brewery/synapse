# Synapse AI agent guide

Synapse is a framework-neutral TypeScript monorepo for local CLI AI integration.

- For every task, agents, subagents and automations must first read and apply `.agents/skills/synapse-architect/SKILL.md`, its shared workflow and its project contract. This is the maintained project architecture, coding, testing and API-documentation skill; it derives from the pinned `.agents/skills/architecture/SKILL.md` base in `pixel-brewery/skills`. Read the base first and then follow the Synapse router and local rules; no independent provider-specific rule copy.
- Preserve user instructions, existing work and the approved Synapse implementation scope. The skill grants no additional authority for external writes, credential changes, commits, releases or publishing.
- The lead architect owns decomposition, disjoint subagent ownership and integration. Concurrent source work is allowed; coordinate one heavy verification task at a time.
- Maintain the native skill under `.agents/skills/`. Keep `CODEX.md`, `CLAUDE.md`, Copilot instructions and OpenCode configuration thin. Edit `.vscode/mcp.json` for shared MCP configuration. No credentials, absolute developer paths or automatic provider installation/login in repository configuration.
- Run `yarn agents:sync` after changing the skill or AI source configuration, then `yarn agents:check`. Generated client projections must never be edited directly or symlinked to the source.
- Before a pull request, run the available local Ship-it review and resolve blocking findings. The standing owner instruction authorizes that review.
- Initial unpublished package versioning is part of scaffolding. Manual releases, release tags and publication require the owner's specific instruction.

## Git delivery and completion

- Work in the designated primary checkout. Do not create an additional worktree unless the owner specifically requests one.
- Assign one Git owner per repository for index, branch, commit, push and merge operations. Parallel source edits must have disjoint ownership and preserve concurrent work.
- An implementation or fix request includes task-scoped commits, pushing the designated development branch and completing the required pull-request integration, unless the owner requests analysis, a draft or local-only work. Follow the repository's normal protected-branch workflow.
- Preserve unrelated changes and identify their owner and scope before integrating them. Never silently include, overwrite or discard another task's edits.
- Remain responsible for a requested pull request until GitHub reports `MERGED`. Do not report delivery complete while requested integration is open, task changes have not been committed and pushed, or the designated checkout differs from its own upstream.
- At completion, verify a clean working tree and zero commits ahead of or behind that upstream. If unrelated work prevents this, report the exact outstanding files and ownership instead of claiming a clean handoff.
- Remove obsolete branches or worktrees only after proving their work is integrated and preserving any remaining unique commits or files.
- Manual releases, package publication, deployments, history rewrites and repository visibility changes require the owner's specific instruction. Regular workflows triggered by an authorized merge remain part of that merge.

## Issue tracking

- Use `pixel-brewery/synapse` issues for authorized follow-up work. Add each issue explicitly to the shared board and track its status on GitHub. [Synapse project board](https://github.com/orgs/pixel-brewery/projects/1)
- Search the board and the repository's open and closed issues before creating a ticket. Update the existing issue when it covers the same underlying problem.
- Read the board's current `Status` options through GitHub Projects or `gh project` before setting status. Verify that each issue appears once on the board with the intended status.
