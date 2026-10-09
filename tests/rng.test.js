// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_rng, random_int } from "../src/engine/rng.js";

// =============================================
// Tests del generador pseudoaleatorio
// ---------------------------------------------

test("same seed produces the same sequence", () => {
  const first_rng = create_rng(42);
  const second_rng = create_rng(42);

  for (let index = 0; index < 100; index++) {
    assert.equal(first_rng(), second_rng());
  }
});

test("different seeds produce different sequences", () => {
  const first_rng = create_rng(1);
  const second_rng = create_rng(2);

  assert.notEqual(first_rng(), second_rng());
});

test("random_int stays inside the range", () => {
  const next_random = create_rng(7);

  for (let index = 0; index < 1000; index++) {
    const value = random_int(next_random, 3, 9);
    assert.ok(value >= 3 && value <= 9);
  }
});

test("create_rng rejects a non integer seed", () => {
  assert.throws(() => create_rng("abc"), /Seed must be an integer/);
});

test("random_int rejects an invalid range", () => {
  assert.throws(() => random_int(create_rng(1), 5, 1), /Invalid range/);
});
