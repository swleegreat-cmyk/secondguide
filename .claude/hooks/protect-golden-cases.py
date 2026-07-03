#!/usr/bin/env python3
"""PreToolUse hook: golden_cases.json에 대한 Edit/Write를 차단한다.
골든 케이스 기대값은 검증 기준선이므로 코드가 아니라 데이터가 보호 대상이다."""
import json
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

tool_input = data.get("tool_input") or {}
path = str(tool_input.get("file_path") or tool_input.get("notebook_path") or "")

if "golden_cases.json" in path:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "골든 케이스 기대값은 보호되어 있습니다"
        }
    }, ensure_ascii=False))
sys.exit(0)
