pragma circom 2.0.0;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

// RangeProof proves that lower <= value < upper.
//
// We use two LessThan comparisons:
//   1. value >= lower  (equivalently: lower <= value, i.e., NOT(value < lower))
//   2. value < upper
//
// For BN254 field elements representing DOT balances, we use 252-bit comparison.
// LessThan(n) works on n-bit values and internally uses n+1 bits for the
// subtraction trick. With n=252, we need 253 bits which is safe for BN254
// (prime is ~254 bits).
//
// Parameters:
//   N - bit width for comparisons (use 252 for BN254 field elements)
//
// Inputs:
//   value - the value to check
//   lower - the lower bound (inclusive)
//   upper - the upper bound (exclusive)

template RangeProof(N) {
    signal input value;
    signal input lower;
    signal input upper;

    // Check: value >= lower (i.e., lower <= value)
    // LessThan outputs 1 if in[0] < in[1], 0 otherwise
    // We want: NOT (value < lower), i.e., LessThan(value, lower) === 0
    component lt1 = LessThan(N);
    lt1.in[0] <== value;
    lt1.in[1] <== lower;
    lt1.out === 0;  // value >= lower

    // Check: value < upper
    component lt2 = LessThan(N);
    lt2.in[0] <== value;
    lt2.in[1] <== upper;
    lt2.out === 1;  // value < upper
}
