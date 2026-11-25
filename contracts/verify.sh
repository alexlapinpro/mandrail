#!/bin/bash
# Verifies every deployed contract on BscScan testnet. Constructor arguments come from the deployment broadcast.
# Usage: pnpm --filter @mandrail/contracts verify [sourcify]
cd "$(dirname "$0")" || exit 1
set -a
. ../.env
set +a
run=broadcast/Deploy.s.sol/97/run-latest.json

python3 - "$run" <<'EOF' | while read -r address name args; do
import json, re, sys

run = json.load(open(sys.argv[1]))
for tx in run["transactions"]:
    if tx["transactionType"] != "CREATE":
        continue
    name = tx["contractName"]
    code = json.load(open(f"out/{name}.sol/{name}.json"))["bytecode"]["object"]
    data = tx["transaction"]["input"]
    assert data.startswith(code), name
    print(tx["contractAddress"], name, data[len(code):] or "-")
EOF
  extra=()
  [ "$args" != "-" ] && extra=(--constructor-args "$args")
  if [ "$1" = sourcify ]; then
    kind=(--verifier sourcify)
  else
    kind=(--verifier etherscan --etherscan-api-key "$BSCSCAN_API_KEY")
  fi
  echo "== $name $address"
  forge verify-contract "$address" "src/$name.sol:$name" --chain 97 "${kind[@]}" "${extra[@]}" --watch 2>&1 |
    grep -E "verified|Pass|Fail|rror|already" | sed "s/$BSCSCAN_API_KEY/***/g" | tail -2
done
