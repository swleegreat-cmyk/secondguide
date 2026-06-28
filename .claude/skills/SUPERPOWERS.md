# Superpowers (vendored)

These skills are the [Superpowers](https://github.com/obra/superpowers) core
skills library by Jesse Vincent, **v6.0.3**, MIT licensed
(see `SUPERPOWERS-LICENSE`).

## Why vendored instead of `/plugin install`

Superpowers normally installs as a Claude plugin:

```
/plugin install superpowers@claude-plugins-official
```

That command is unavailable in the Claude Code **web (remote) harness**, so the
skills are copied directly into `.claude/skills/` — the same in-repo pattern the
`watch` skill already uses. This makes them load in every session (local and
web) and keeps them under version control.

## Skills included

brainstorming · writing-plans · executing-plans · subagent-driven-development ·
test-driven-development · systematic-debugging · verification-before-completion ·
requesting-code-review · receiving-code-review · dispatching-parallel-agents ·
using-git-worktrees · finishing-a-development-branch · writing-skills ·
using-superpowers

## Auto-activation

The plugin primes the agent at session start by injecting the
`using-superpowers` skill so the others trigger automatically. That behaviour is
reproduced by `.claude/hooks/superpowers-session-start.sh`, registered as a
`SessionStart` hook in `.claude/settings.json`. Without that hook the skills
still work — just invoke them explicitly via the `Skill` tool (e.g.
`/brainstorming`, `/test-driven-development`).

## Updating

Re-download the release tarball and recopy:

```
curl -sSL https://codeload.github.com/obra/superpowers/tar.gz/refs/heads/main \
  | tar xz -C /tmp && cp -r /tmp/superpowers-*/skills/* .claude/skills/
```
