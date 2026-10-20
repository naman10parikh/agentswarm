@AGENTS.md

# Claude Code in agentswarm

Everything any coding agent needs is in `AGENTS.md`, imported above. This file holds only what is specific to Claude
Code.

## What loads when you open this repository

- **Hooks** (`.claude/settings.json`): `PreToolUse` on Bash runs `.claude/hooks/block-dangerous-commands.cjs`, and on
  Read, Edit, Write and Bash runs `.claude/hooks/protect-secrets.cjs`, which keeps `.env` files and keys out of the
  session; `PostToolUse` on Write, Edit and Bash runs `.claude/hooks/audit-log.sh`, which appends one line per change
  to `.claude/audit.jsonl` (gitignored).
- **Sub-agents** (`.claude/agents/`): `swarm-designer` and `swarm-doctor` are agentswarm's own; the other seven
  (`architect`, `code-reviewer`, `test-writer` and the rest) are general reviewers for work on this codebase.
- **MCP** (`.mcp.json`): only agentswarm's own server, `agentswarm-mcp`. The inherited development servers (GitHub,
  Context7, a file-backed memory and an Obsidian vault over `brain/`) need a token or a relative path, so they live in
  `.mcp.dev.json`. Load them with `claude --mcp-config .mcp.dev.json`.
- **Rules** (`.claude/rules/`) are glob-loaded every session.

## The plugin

`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` make this repository a Claude Code plugin: the
skills in `skills/`, the two sub-agents, the MCP server and the `swarm-guard` hook in `hooks/hooks.json`. Check it with
`claude plugin validate .` before you change any of those files.

## Working here

- You may be running inside the person's tmux. Never run `agentswarm run` against their server to test a change: it
  opens a session and starts real agents. Use `pnpm eval`, which runs every swarm on a private tmux server with
  stand-in agents.
- Follow the commit grammar in `AGENTS.md` (`feat(skill):`, `feat(employee):`, `feat(company):` and the standard
  scopes).
- Act, then test as a user: `pnpm build && pnpm test && pnpm eval`, then the command you changed.
- When you fix an error, add it to `memory/LEARNINGS.md` as what broke, the root cause, and the rule.
