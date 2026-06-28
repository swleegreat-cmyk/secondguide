#!/usr/bin/env bash
# SessionStart hook for the vendored Superpowers skills library.
#
# Superpowers ships as a Claude plugin, but `/plugin` is unavailable in the
# web (remote) harness, so the skills are vendored in-repo under
# .claude/skills/ instead. This hook reproduces the plugin's only runtime
# behaviour: injecting the `using-superpowers` skill into session context so
# the rest of the skills trigger automatically.
#
# Source: https://github.com/obra/superpowers (MIT), v6.0.3
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SKILL_FILE="${PROJECT_DIR}/.claude/skills/using-superpowers/SKILL.md"

# Nothing to inject if the skill isn't present — fail open, never block startup.
[ -f "$SKILL_FILE" ] || exit 0

using_superpowers_content="$(cat "$SKILL_FILE" 2>/dev/null || echo "Error reading using-superpowers skill")"

# Escape for JSON embedding via bash parameter substitution (fast, no jq dep).
escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

content_escaped="$(escape_for_json "$using_superpowers_content")"
session_context="<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n**Below is the full content of your 'using-superpowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${content_escaped}\n</EXTREMELY_IMPORTANT>"

# Claude Code reads hookSpecificOutput.additionalContext.
printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$session_context"

exit 0
