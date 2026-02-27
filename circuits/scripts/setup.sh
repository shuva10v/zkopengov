#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CIRCUITS_DIR"

mkdir -p build

# Check that the circuit has been compiled
if [ ! -f build/PrivateVote.r1cs ]; then
    echo "Error: build/PrivateVote.r1cs not found. Run 'npm run compile' first."
    exit 1
fi

# Get the number of constraints to determine the required powers of tau
# For depth-20 trees with Poseidon, we need at least 2^16 = 65536 constraints
# pot16 supports up to 2^16 constraints. If the circuit exceeds this, use pot17 or higher.
PTAU_FILE="build/pot16_final.ptau"
PTAU_URL="https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau"

# Download powers of tau if not present
if [ ! -f "$PTAU_FILE" ]; then
    echo "Downloading powers of tau (pot16)..."
    if command -v wget &> /dev/null; then
        wget -O "$PTAU_FILE" "$PTAU_URL"
    elif command -v curl &> /dev/null; then
        curl -L -o "$PTAU_FILE" "$PTAU_URL"
    else
        echo "Error: neither wget nor curl found. Please install one."
        exit 1
    fi
    echo "Download complete."
fi

# Phase 2: circuit-specific setup
echo ""
echo "Running Groth16 setup (Phase 2)..."
snarkjs groth16 setup build/PrivateVote.r1cs "$PTAU_FILE" build/circuit_0000.zkey

echo ""
echo "Contributing to phase 2 ceremony..."
echo "test" | snarkjs zkey contribute build/circuit_0000.zkey build/circuit_final.zkey --name="hackathon" -v

echo ""
echo "Exporting verification key..."
snarkjs zkey export verificationkey build/circuit_final.zkey build/verification_key.json

echo ""
echo "Setup complete!"
echo "Outputs:"
echo "  build/circuit_final.zkey"
echo "  build/verification_key.json"
