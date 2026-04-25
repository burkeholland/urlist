#!/bin/bash

INPUT=$(cat)

# Extract the tool name and file path from the hook input
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.filePath // empty')

# Only run on file-write tools
if [[ "$TOOL_NAME" != "create_file" && "$TOOL_NAME" != "replace_string_in_file" && "$TOOL_NAME" != "multi_replace_string_in_file" ]]; then
  exit 0
fi

# Only lint JS/TS files
if [[ ! "$FILE_PATH" =~ \.(js|jsx|ts|tsx|mjs|cjs)$ ]]; then
  exit 0
fi

# Run ESLint on the changed file
LINT_OUTPUT=$(npx eslint "$FILE_PATH" 2>&1)
LINT_EXIT=$?

if [[ $LINT_EXIT -ne 0 ]]; then
  jq -n --arg reason "Linting failed for $FILE_PATH" \
        --arg context "$LINT_OUTPUT" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason,
        additionalContext: $context
      }
    }'
  exit 0
fi

# Linting passed — no output needed
exit 0
