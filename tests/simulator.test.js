// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { create_simulator } from "../src/engine/simulator.js";
import { parse_operations } from "../src/engine/parser.js";
import { generate_operations } from "../src/engine/generator.js";
import { VALID_ALGORITHMS } from "../src/engine/types.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

const ANEXO_1_TEXT = readFileSync(new URL("../examples/anexo1.txt", import.meta.url), "utf8");

// =============================================
// Estado inicial
// ---------------------------------------------

test("a new simulator has executed nothing and is not finished", () => {
  const simulator = create_simulator("FIFO", parse_operations(ANEXO_1_TEXT));
  const snapshot = simulator.get_snapshot();

  assert.equal(snapshot.algorithm_name, "FIFO");
  assert.equal(snapshot.operation_index, 0);
  assert.equal(snapshot.total_operations, 16);
  assert.equal(snapshot.finished, false);
  assert.equal(snapshot.last_operation, null);
  assert.equal(snapshot.opt.metrics.clock_seconds, 0);
  assert.equal(snapshot.selected.metrics.clock_seconds, 0);
  assert.equal(snapshot.opt.frames.length, 100);
  assert.equal(snapshot.selected.frames.length, 100);
});

// =============================================
// Ejecucion coordinada
// ---------------------------------------------

test("step executes one operation in both MMUs", () => {
  const simulator = create_simulator("LRU", parse_operations(ANEXO_1_TEXT));

  assert.equal(simulator.step(), true);
  const snapshot = simulator.get_snapshot();

  assert.equal(snapshot.operation_index, 1);
  assert.equal(snapshot.last_operation, "new(1,500)");
  assert.equal(snapshot.opt.pages.length, 1);
  assert.equal(snapshot.selected.pages.length, 1);
  assert.equal(snapshot.opt.metrics.clock_seconds, 5);
  assert.equal(snapshot.selected.metrics.clock_seconds, 5);
});

test("both MMUs always process the same number of operations", () => {
  const simulator = create_simulator("SC", generate_operations(1, 10, 500));

  for (let step_number = 1; step_number <= 500; step_number++) {
    simulator.step();
    const snapshot = simulator.get_snapshot();
    assert.equal(snapshot.operation_index, step_number);
    assert.equal(snapshot.opt.metrics.page_hits + snapshot.opt.metrics.page_faults > 0, true);
  }
});

test("both MMUs finish at the same time", () => {
  const simulator = create_simulator("FIFO", generate_operations(2, 10, 500));

  simulator.step_many(499);
  assert.equal(simulator.is_finished(), false);

  simulator.step();
  const snapshot = simulator.get_snapshot();

  assert.equal(simulator.is_finished(), true);
  assert.equal(snapshot.finished, true);
  assert.equal(snapshot.opt.metrics.active_processes, 0);
  assert.equal(snapshot.selected.metrics.active_processes, 0);
});

test("step returns false after the last operation and does not change the state", () => {
  const simulator = create_simulator("FIFO", parse_operations(ANEXO_1_TEXT));
  simulator.step_many(16);
  const before = simulator.get_snapshot();

  assert.equal(simulator.step(), false);

  assert.deepEqual(simulator.get_snapshot(), before);
});

test("step_many returns how many operations it really executed", () => {
  const simulator = create_simulator("FIFO", parse_operations(ANEXO_1_TEXT));

  assert.equal(simulator.step_many(10), 10);
  assert.equal(simulator.step_many(10), 6);
  assert.equal(simulator.step_many(10), 0);
});

test("each MMU keeps its own clock", () => {
  const operations = generate_operations(1, 10, 1000);
  const simulator = create_simulator("FIFO", operations);

  simulator.step_many(1000);
  const snapshot = simulator.get_snapshot();

  // OPT hace menos fallos que FIFO, por eso sus relojes terminan distintos
  assert.ok(snapshot.opt.metrics.clock_seconds < snapshot.selected.metrics.clock_seconds);
});

test("the Annex 1 trace gives the same result in OPT and in the selected algorithm", () => {
  for (const name of VALID_ALGORITHMS) {
    const simulator = create_simulator(name, parse_operations(ANEXO_1_TEXT));
    simulator.step_many(16);
    const snapshot = simulator.get_snapshot();

    assert.equal(snapshot.opt.metrics.clock_seconds, 28, name);
    assert.deepEqual(snapshot.opt.metrics, snapshot.selected.metrics, name);
  }
});

test("the snapshot is a copy, later steps do not change an old snapshot", () => {
  const simulator = create_simulator("FIFO", parse_operations(ANEXO_1_TEXT));
  simulator.step();
  const old_snapshot = simulator.get_snapshot();

  simulator.step_many(5);

  assert.equal(old_snapshot.operation_index, 1);
  assert.equal(old_snapshot.opt.metrics.clock_seconds, 5);
  assert.equal(old_snapshot.opt.pages.length, 1);
});

// =============================================
// Rendimiento con la carga maxima
// ---------------------------------------------

test("a simulation with P=100 and N=5000 runs to the end for every algorithm", () => {
  const operations = generate_operations(1, 100, 5000);

  for (const name of VALID_ALGORITHMS) {
    const simulator = create_simulator(name, operations);
    simulator.step_many(5000);
    const snapshot = simulator.get_snapshot();

    assert.equal(snapshot.finished, true, name);
    assert.equal(snapshot.opt.metrics.loaded_pages, 0, name);
    assert.equal(snapshot.selected.metrics.loaded_pages, 0, name);
    assert.ok(snapshot.opt.metrics.clock_seconds <= snapshot.selected.metrics.clock_seconds, name);
  }
});

// =============================================
// Parametros invalidos
// ---------------------------------------------

test("create_simulator rejects an unknown algorithm", () => {
  assert.throws(() => create_simulator("OPT", parse_operations(ANEXO_1_TEXT)), /Algoritmo desconocido: OPT/);
  assert.throws(() => create_simulator("MRU", parse_operations(ANEXO_1_TEXT)), /Algoritmo desconocido: MRU/);
});

test("create_simulator rejects an invalid operation list", () => {
  assert.throws(() => create_simulator("FIFO", []), /al menos una operación/);
  assert.throws(() => create_simulator("FIFO", null), /al menos una operación/);
});
