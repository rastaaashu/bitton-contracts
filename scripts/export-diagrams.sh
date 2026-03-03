#!/usr/bin/env bash
# Export Mermaid diagrams from docs/DIAGRAMS.md to PNG files
# Requires: npm install -g @mermaid-js/mermaid-cli

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIAGRAMS_FILE="$ROOT_DIR/docs/DIAGRAMS.md"
OUTPUT_DIR="$ROOT_DIR/docs/images"

mkdir -p "$OUTPUT_DIR"

# Check for mmdc
if ! command -v mmdc &>/dev/null; then
  echo "Error: mmdc not found. Install with: npm install -g @mermaid-js/mermaid-cli"
  exit 1
fi

# Extract mermaid code blocks and render each
COUNTER=0
NAMES=("01_email_registration" "02_wallet_auth" "03_staking_lifecycle" "04_migration_pipeline" "05_contract_architecture" "06_user_status")

while IFS= read -r -d '' block; do
  if [ $COUNTER -lt ${#NAMES[@]} ]; then
    NAME="${NAMES[$COUNTER]}"
  else
    NAME="diagram_$COUNTER"
  fi

  TEMP_FILE=$(mktemp /tmp/mermaid_XXXXXX.mmd)
  echo "$block" > "$TEMP_FILE"

  echo "Rendering $NAME.png..."
  mmdc -i "$TEMP_FILE" -o "$OUTPUT_DIR/$NAME.png" -t dark -w 1200 -H 800 2>/dev/null || \
    mmdc -i "$TEMP_FILE" -o "$OUTPUT_DIR/$NAME.png" 2>/dev/null || \
    echo "  Warning: Failed to render $NAME"

  rm -f "$TEMP_FILE"
  COUNTER=$((COUNTER + 1))
done < <(grep -Pzo '(?s)```mermaid\n\K.*?(?=\n```)' "$DIAGRAMS_FILE" | tr '\0' '\n' | awk 'BEGIN{RS="```mermaid\n"; FS="\n```"} NR>1{print $1; printf "\0"}')

# Fallback: simpler extraction if the above fails
if [ $COUNTER -eq 0 ]; then
  echo "Using fallback extraction..."
  IN_BLOCK=0
  BLOCK=""

  while IFS= read -r line; do
    if [[ "$line" == '```mermaid' ]]; then
      IN_BLOCK=1
      BLOCK=""
      continue
    fi
    if [[ "$line" == '```' ]] && [ $IN_BLOCK -eq 1 ]; then
      IN_BLOCK=0
      if [ $COUNTER -lt ${#NAMES[@]} ]; then
        NAME="${NAMES[$COUNTER]}"
      else
        NAME="diagram_$COUNTER"
      fi

      TEMP_FILE=$(mktemp /tmp/mermaid_XXXXXX.mmd)
      echo "$BLOCK" > "$TEMP_FILE"
      echo "Rendering $NAME.png..."
      mmdc -i "$TEMP_FILE" -o "$OUTPUT_DIR/$NAME.png" 2>/dev/null || echo "  Warning: Failed to render $NAME"
      rm -f "$TEMP_FILE"
      COUNTER=$((COUNTER + 1))
      continue
    fi
    if [ $IN_BLOCK -eq 1 ]; then
      BLOCK="$BLOCK
$line"
    fi
  done < "$DIAGRAMS_FILE"
fi

echo ""
echo "Done. Rendered $COUNTER diagrams to $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR/"*.png 2>/dev/null || echo "No PNG files generated (install mmdc first)"
