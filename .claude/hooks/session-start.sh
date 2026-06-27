#!/bin/bash
# SessionStart hook: install runtime deps for the Claude Video (/watch) skill.
# The skill itself ships in-repo at .claude/skills/watch, so it is already
# registered at session start — this hook only provides yt-dlp + ffmpeg.
# Idempotent and non-interactive; only runs in the remote (web) environment.
set -uo pipefail

# Only run in Claude Code on the web; do nothing on local machines.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

log() { echo "[watch-setup] $*" >&2; }

# 1. yt-dlp (video download) — via pip, cached in the container image layer.
if ! command -v yt-dlp >/dev/null 2>&1; then
  log "installing yt-dlp via pip…"
  pip install --quiet yt-dlp >&2 || log "WARN: yt-dlp install failed"
else
  log "yt-dlp already present ($(yt-dlp --version 2>/dev/null))"
fi

# 2. ffmpeg + ffprobe (frame extraction / audio) — via apt, skip heavy recommends.
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  log "installing ffmpeg via apt…"
  apt-get update -qq >&2 2>/dev/null || true
  apt-get install -y --no-install-recommends ffmpeg >&2 2>/dev/null \
    || log "WARN: ffmpeg install failed"
else
  log "ffmpeg already present"
fi

log "done. Use /watch <url-or-path> to analyze a video."
exit 0
