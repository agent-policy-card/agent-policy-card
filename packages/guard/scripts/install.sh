#!/usr/bin/env bash
set -euo pipefail
# Installs the Agent Policy Card guard for the current user.
# Usage: install.sh <path-to-real-baw> <guarded-wallet-address> <card-contract-address>
# It never moves or edits the real baw binary.

if [ "$#" -ne 3 ]; then
  echo "usage: install.sh <path-to-real-baw> <guarded-wallet-address> <card-contract-address>" >&2
  exit 1
fi

REAL_BAW="$1"
WALLET="$2"
CARD="$3"
DIR="$HOME/.agent-policy-card"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -x "$REAL_BAW" ]; then
  echo "not an executable: $REAL_BAW" >&2
  exit 1
fi
for a in "$WALLET" "$CARD"; do
  if ! [[ "$a" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "not an address: $a" >&2
    exit 1
  fi
done

mkdir -p "$DIR/bin"
chmod 700 "$DIR"
cat > "$DIR/config.json" <<JSON
{
  "realBaw": "$REAL_BAW",
  "wallet": "$WALLET",
  "rpcUrls": ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"],
  "cardContract": "$CARD"
}
JSON
chmod 600 "$DIR/config.json"

cp "$HERE/dist/apc-baw.mjs" "$DIR/bin/apc-baw"
cp "$HERE/dist/apc-confirm.mjs" "$DIR/bin/apc-confirm"
chmod 755 "$DIR/bin/apc-baw" "$DIR/bin/apc-confirm"
ln -sf "$DIR/bin/apc-baw" "$DIR/bin/apc-guard"
ln -sf "$DIR/bin/apc-baw" "$DIR/bin/baw"

echo "Installed to $DIR/bin."
echo "Add this line to the agent's shell profile so the guard runs before the real baw:"
echo "  export PATH=\"$DIR/bin:\$PATH\""
