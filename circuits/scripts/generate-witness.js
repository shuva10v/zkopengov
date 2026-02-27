#!/usr/bin/env node

/**
 * generate-witness.js
 *
 * Generates a witness for the PrivateVote circuit from a JSON input file.
 *
 * Usage:
 *   node scripts/generate-witness.js <input.json> [output.wtns]
 *
 * The input JSON file must contain all signals required by the circuit.
 * If no output path is specified, the witness is written to build/witness.wtns.
 */

const path = require("path");
const fs = require("fs");

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error("Usage: node generate-witness.js <input.json> [output.wtns]");
        process.exit(1);
    }

    const inputPath = path.resolve(args[0]);
    const outputPath = args[1]
        ? path.resolve(args[1])
        : path.resolve(__dirname, "..", "build", "witness.wtns");

    // Read input JSON
    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Input file not found: ${inputPath}`);
        process.exit(1);
    }

    const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));

    // Load the WASM witness generator
    const wasmPath = path.resolve(
        __dirname,
        "..",
        "build",
        "PrivateVote_js",
        "PrivateVote.wasm"
    );
    const witnessCalcPath = path.resolve(
        __dirname,
        "..",
        "build",
        "PrivateVote_js",
        "witness_calculator.js"
    );

    if (!fs.existsSync(wasmPath)) {
        console.error(
            `Error: WASM file not found: ${wasmPath}\nRun 'npm run compile' first.`
        );
        process.exit(1);
    }

    if (!fs.existsSync(witnessCalcPath)) {
        console.error(
            `Error: witness_calculator.js not found: ${witnessCalcPath}\nRun 'npm run compile' first.`
        );
        process.exit(1);
    }

    const wc = require(witnessCalcPath);
    const wasmBuffer = fs.readFileSync(wasmPath);

    console.log("Calculating witness...");
    const witnessCalculator = await wc(wasmBuffer);
    const witness = await witnessCalculator.calculateWTNSBin(input, 0);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, witness);
    console.log(`Witness written to ${outputPath}`);
    console.log(`Witness size: ${witness.length} bytes`);
}

main().catch((err) => {
    console.error("Error generating witness:", err.message || err);
    process.exit(1);
});
