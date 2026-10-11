// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build_scenario } from "../src/engine/scenario.js";
import { serialize_operations } from "../src/engine/parser.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

const ANEXO_1_TEXT = readFileSync(new URL("../examples/anexo1.txt", import.meta.url), "utf8");

// Opciones validas de la pantalla de preparacion, sin archivo
function generated_options() {
  return { seed: 1, algorithm_name: "LRU", process_count: 10, operation_count: 500, file_text: null };
}

// =============================================
// Escenario generado
// ---------------------------------------------

test("builds a generated scenario with the requested number of operations", () => {
  const scenario = build_scenario(generated_options());

  assert.equal(scenario.source, "generated");
  assert.equal(scenario.algorithm_name, "LRU");
  assert.equal(scenario.operations.length, 500);
  assert.equal(scenario.description, "Semilla 1, P=10, N=500");
});

test("the same seed builds the same scenario", () => {
  const first = serialize_operations(build_scenario(generated_options()).operations);
  const second = serialize_operations(build_scenario(generated_options()).operations);

  assert.equal(first, second);
});

// =============================================
// Escenario desde archivo
// ---------------------------------------------

test("builds a scenario from a file and ignores seed, P and N", () => {
  const options = { ...generated_options(), seed: "ignored", process_count: 7, file_text: ANEXO_1_TEXT };
  const scenario = build_scenario(options);

  assert.equal(scenario.source, "file");
  assert.equal(scenario.operations.length, 16);
  assert.equal(scenario.description, "Archivo de operaciones, 16 operaciones");
});

test("a file with errors stops the scenario with the parser message", () => {
  const options = { ...generated_options(), file_text: "new(1,10)\nuse(5)" };

  assert.throws(() => build_scenario(options), /el ptr 5 nunca fue creado/);
});

test("an empty file stops the scenario", () => {
  const options = { ...generated_options(), file_text: "" };

  assert.throws(() => build_scenario(options), /no tiene operaciones/);
});

// =============================================
// Datos invalidos
// ---------------------------------------------

test("rejects an algorithm that is not selectable", () => {
  assert.throws(() => build_scenario({ ...generated_options(), algorithm_name: "OPT" }), /El algoritmo debe ser uno de/);
  assert.throws(() => build_scenario({ ...generated_options(), algorithm_name: "" }), /El algoritmo debe ser uno de/);
});

test("rejects a seed that is not an integer when generating", () => {
  assert.throws(() => build_scenario({ ...generated_options(), seed: NaN }), /La semilla debe ser un entero/);
  assert.throws(() => build_scenario({ ...generated_options(), seed: 1.5 }), /La semilla debe ser un entero/);
});

test("rejects P and N values outside the ones of the statement", () => {
  assert.throws(() => build_scenario({ ...generated_options(), process_count: 20 }), /La cantidad de procesos debe ser una de/);
  assert.throws(() => build_scenario({ ...generated_options(), operation_count: 750 }), /La cantidad de operaciones debe ser una de/);
});
