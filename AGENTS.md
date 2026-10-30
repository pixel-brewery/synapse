# Synapse AI agent guide

Synapse is a framework-neutral TypeScript monorepo for local CLI AI integration.

- For every task, agents, subagents and automations must first read and apply `.agents/skills/synapse-architect/SKILL.md`, its shared workflow and its project contract. This is the sole maintained architecture, coding, testing and API-documentation skill. Follow its routing; no second architecture skill or independent provider-specific rule copy.
- Preserve user instructions, existing work and the approved Synapse implementation scope. The skill grants no additional authority for external writes, credential changes, commits, releases or publishing.
- The lead architect owns decomposition, disjoint subagent ownership and integration. Concurrent source work is allowed; coordinate one heavy verification task at a time.
- Maintain the native skill under `.agents/skills/`. Keep `CODEX.md`, `CLAUDE.md`, Copilot instructions and OpenCode configuration thin. Edit `.vscode/mcp.json` for shared MCP configuration. No credentials, absolute developer paths or automatic provider installation/login in repository configuration.
- Run `yarn agents:sync` after changing the skill or AI source configuration, then `yarn agents:check`. Generated client projections must never be edited directly or symlinked to the source.
- Before a pull request, run the available local Ship-it review and resolve blocking findings. Do not create a PR, commit, push, merge or publish unless the user has authorized that action.
- Initial unpublished package versioning is part of scaffolding. Published versions, release tags and publication remain owner actions.
