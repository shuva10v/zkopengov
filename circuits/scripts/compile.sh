#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CIRCUITS_DIR"

mkdir -p build

echo "Compiling PrivateVote.circom..."
circom PrivateVote.circom --r1cs --wasm --sym -o build/ -l node_modules

echo ""
echo "Circuit compiled successfully."
echo "Constraints info:"
snarkjs r1cs info build/PrivateVote.r1cs

echo ""
echo "Outputs:"
echo "  build/PrivateVote.r1cs"
echo "  build/PrivateVote_js/PrivateVote.wasm"
echo "  build/PrivateVote.sym"
