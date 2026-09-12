#!/usr/bin/env bash
# Runs the Anchor test suite against a local validator on this Windows host.
#
#   source tools/env.sh && tools/test-local.sh [--build]
#
# Why not plain `anchor test`: anchor starts solana-test-validator without
# `--log`, and without `--log` the validator symlinks validator.log, which
# needs SeCreateSymbolicLinkPrivilege (Developer Mode or admin) and panics
# with os error 1314 here. So this script starts the validator itself with
# `--log` and the programs preloaded, then runs anchor with
# --skip-local-validator --skip-deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--build" ]; then anchor build; fi

WALLET=$(grep -E '^wallet' Anchor.toml | sed -E 's/.*"([^"]+)".*/\1/')
MINT=$(solana-keygen pubkey "$WALLET")
LEDGER=.anchor/test-ledger
rm -rf "$LEDGER"; mkdir -p .anchor

args=(--ledger "$LEDGER" --reset --log --mint "$MINT" --rpc-port 8899)
for kp in target/deploy/*-keypair.json; do
	name=$(basename "$kp" -keypair.json)
	args+=(--bpf-program "$(solana-keygen pubkey "$kp")" "target/deploy/$name.so")
done

solana-test-validator "${args[@]}" > .anchor/validator-stdout.log 2>&1 &
VPID=$!
trap 'kill $VPID 2>/dev/null || true' EXIT

for i in $(seq 1 60); do
	if solana cluster-version -u http://127.0.0.1:8899 >/dev/null 2>&1; then break; fi
	sleep 1
	if ! kill -0 $VPID 2>/dev/null; then echo "validator died:"; tail -20 .anchor/validator-stdout.log; exit 1; fi
done

anchor test --skip-local-validator --skip-deploy --skip-build --provider.cluster localnet --provider.wallet "$WALLET"
