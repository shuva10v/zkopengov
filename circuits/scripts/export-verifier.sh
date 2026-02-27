#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CIRCUITS_DIR"

if [ ! -f build/circuit_final.zkey ]; then
    echo "Error: build/circuit_final.zkey not found. Run 'npm run setup' first."
    exit 1
fi

echo "Exporting Solidity verifier..."
snarkjs zkey export solidityverifier build/circuit_final.zkey build/Groth16Verifier.sol

echo "Solidity verifier exported to build/Groth16Verifier.sol"

# Also copy to contracts directory if it exists
CONTRACTS_DIR="$(dirname "$CIRCUITS_DIR")/contracts/contracts"
if [ -d "$CONTRACTS_DIR" ]; then
    cp build/Groth16Verifier.sol "$CONTRACTS_DIR/Groth16Verifier.sol"
    echo "Also copied to $CONTRACTS_DIR/Groth16Verifier.sol"
fi
