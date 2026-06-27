#!/bin/bash
# SessionStart hook: provision the Claude Video (/watch) skill for web sessions.
# Installs yt-dlp + ffmpeg and drops the skill into ~/.claude/skills/watch.
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

# 3. watch skill source — fetch tarball and unpack into ~/.claude/skills/watch.
SKILL_DIR="${HOME}/.claude/skills/watch"
if [ ! -f "${SKILL_DIR}/SKILL.md" ]; then
  log "installing watch skill into ${SKILL_DIR}…"
  TMP="$(mktemp -d)"
  if curl -fsSL -o "${TMP}/cv.tar.gz" \
      https://codeload.github.com/bradautomates/claude-video/tar.gz/refs/heads/main; then
    tar xzf "${TMP}/cv.tar.gz" -C "${TMP}"
    SRC="$(find "${TMP}" -maxdepth 1 -type d -name 'claude-video-*' | head -1)"
    if [ -n "${SRC}" ] && [ -f "${SRC}/SKILL.md" ]; then
      mkdir -p "${SKILL_DIR}"
      cp -r "${SRC}/SKILL.md" "${SRC}/scripts" "${SRC}/README.md" "${SRC}/LICENSE" "${SKILL_DIR}/"
      log "watch skill installed"
    else
      log "WARN: unexpected tarball layout; skill not installed"
    fi
  else
    log "WARN: could not download watch skill tarball"
  fi
  rm -rf "${TMP}"
else
  log "watch skill already installed"
fi

log "done. Use /watch <url-or-path> to analyze a video."
exit 0
