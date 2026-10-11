// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { generate_operations } from "../src/engine/generator.js";
import { parse_operations, serialize_operations, validate_operations } from "../src/engine/parser.js";
import { create_mmu } from "../src/engine/mmu.js";
import { create_algorithm, create_opt_algorithm } from "../src/engine/algorithms/index.js";
import {
  VALID_ALGORITHMS,
  VALID_PROCESS_COUNTS,
  VALID_OPERATION_COUNTS,
  PAGE_SIZE_BYTES,
  RAM_PAGES,
} from "../src/engine/types.js";

// =============================================
// Repetibilidad
// ---------------------------------------------

test("the same seed produces exactly the same file, byte by byte", () => {
  const first_file = serialize_operations(generate_operations(2024, 10, 500));
  const second_file = serialize_operations(generate_operations(2024, 10, 500));

  assert.equal(first_file, second_file);
});

test("the same seed repeats the file for every P and N combination", () => {
  for (const process_count of VALID_PROCESS_COUNTS) {
    for (const operation_count of VALID_OPERATION_COUNTS) {
      const first_file = serialize_operations(generate_operations(7, process_count, operation_count));
      const second_file = serialize_operations(generate_operations(7, process_count, operation_count));
      assert.equal(first_file, second_file, `P=${process_count} N=${operation_count}`);
    }
  }
});

test("different seeds produce different files", () => {
  const first_file = serialize_operations(generate_operations(1, 10, 500));
  const second_file = serialize_operations(generate_operations(2, 10, 500));

  assert.notEqual(first_file, second_file);
});

// =============================================
// Validez de lo generado
// ---------------------------------------------

test("generates exactly N operations for every P and N combination", () => {
  for (const process_count of VALID_PROCESS_COUNTS) {
    for (const operation_count of VALID_OPERATION_COUNTS) {
      const operations = generate_operations(3, process_count, operation_count);
      assert.equal(operations.length, operation_count, `P=${process_count} N=${operation_count}`);
    }
  }
});

test("every generated list passes the validation rules of the statement", () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    for (const process_count of VALID_PROCESS_COUNTS) {
      const operations = generate_operations(seed, process_count, 1000);
      assert.doesNotThrow(() => validate_operations(operations), `seed ${seed} P=${process_count}`);
    }
  }
});

test("every process is terminated once, with kill as its last operation", () => {
  const operations = generate_operations(5, 50, 1000);
  const last_index_by_pid = new Map();
  const kill_index_by_pid = new Map();

  for (const [index, operation] of operations.entries()) {
    last_index_by_pid.set(operation.pid, index);
    if (operation.type === "kill") {
      assert.equal(kill_index_by_pid.has(operation.pid), false, `pid ${operation.pid} killed twice`);
      kill_index_by_pid.set(operation.pid, index);
    }
  }

  assert.equal(kill_index_by_pid.size, 50);
  for (const [pid, kill_index] of kill_index_by_pid.entries()) {
    assert.equal(last_index_by_pid.get(pid), kill_index, `pid ${pid} has operations after its kill`);
  }
});

test("uses exactly P different processes and each does something before its kill", () => {
  const operations = generate_operations(8, 10, 500);
  const pids = new Set();
  const work_by_pid = new Map();

  for (const operation of operations) {
    pids.add(operation.pid);
    if (operation.type !== "kill") {
      work_by_pid.set(operation.pid, true);
    }
  }

  assert.equal(pids.size, 10);
  assert.equal(work_by_pid.size, 10);
});

test("the first operation of every process is a new", () => {
  const operations = generate_operations(9, 10, 500);
  const seen_pids = new Set();

  for (const operation of operations) {
    if (!seen_pids.has(operation.pid)) {
      assert.equal(operation.type, "new", `pid ${operation.pid} starts with ${operation.type}`);
      seen_pids.add(operation.pid);
    }
  }
});

test("the generated file can be loaded back with the parser", () => {
  const operations = generate_operations(11, 10, 500);
  const reloaded = parse_operations(serialize_operations(operations));

  assert.deepEqual(reloaded, operations);
});

// =============================================
// Tamanos
// ---------------------------------------------

test("no generated block reaches 100 pages", () => {
  for (const seed of [1, 2, 3]) {
    for (const operation of generate_operations(seed, 10, 5000)) {
      if (operation.type === "new") {
        assert.ok(operation.size >= 1);
        assert.ok(Math.ceil(operation.size / PAGE_SIZE_BYTES) < RAM_PAGES);
      }
    }
  }
});

test("most blocks are small but some span several pages", () => {
  const operations = generate_operations(4, 10, 5000);
  let new_count = 0;
  let small_count = 0;
  let multi_page_count = 0;

  for (const operation of operations) {
    if (operation.type !== "new") {
      continue;
    }
    new_count++;
    if (operation.size <= PAGE_SIZE_BYTES) {
      small_count++;
    } else {
      multi_page_count++;
    }
  }

  assert.ok(small_count / new_count > 0.7, "at least 70% should fit in one page");
  assert.ok(multi_page_count > 0, "some blocks should span several pages");
});

// =============================================
// Parametros invalidos
// ---------------------------------------------

test("generate_operations rejects a non integer seed", () => {
  assert.throws(() => generate_operations("abc", 10, 500), /La semilla debe ser un entero/);
  assert.throws(() => generate_operations(1.5, 10, 500), /La semilla debe ser un entero/);
});

test("generate_operations rejects an invalid process or operation count", () => {
  assert.throws(() => generate_operations(1, 0, 500), /La cantidad de procesos debe ser un entero positivo/);
  assert.throws(() => generate_operations(1, 10, -5), /La cantidad de operaciones debe ser un entero positivo/);
  assert.throws(() => generate_operations(1, 10, 2.5), /La cantidad de operaciones debe ser un entero positivo/);
});

test("generate_operations rejects an N too small for P processes", () => {
  assert.throws(() => generate_operations(1, 10, 19), /muy pocas para 10 procesos/);
  assert.doesNotThrow(() => generate_operations(1, 10, 20));
});

// =============================================
// Integracion con la MMU
// ---------------------------------------------

test("every algorithm can run a generated file for every P and N combination", () => {
  for (const process_count of VALID_PROCESS_COUNTS) {
    for (const operation_count of VALID_OPERATION_COUNTS) {
      const operations = generate_operations(21, process_count, operation_count);

      for (const name of VALID_ALGORITHMS) {
        const mmu = create_mmu(create_algorithm(name));
        for (const operation of operations) {
          mmu.execute(operation);
        }
        const metrics = mmu.get_metrics();
        assert.equal(metrics.active_processes, 0, `${name} P=${process_count} N=${operation_count}`);
        assert.equal(metrics.loaded_pages, 0);
        assert.equal(metrics.fragmentation_bytes, 0);
      }
    }
  }
});

test("OPT never loses to another algorithm on generated files", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const operations = generate_operations(seed, 10, 1000);
    const opt_mmu = create_mmu(create_opt_algorithm(operations));
    for (const operation of operations) {
      opt_mmu.execute(operation);
    }
    const opt_metrics = opt_mmu.get_metrics();

    for (const name of VALID_ALGORITHMS) {
      const mmu = create_mmu(create_algorithm(name));
      for (const operation of operations) {
        mmu.execute(operation);
      }
      const metrics = mmu.get_metrics();
      assert.ok(opt_metrics.clock_seconds <= metrics.clock_seconds, `seed ${seed}, ${name}`);
    }
  }
});

test("a generated file with P=10 and N=1000 forces page replacements", () => {
  const operations = generate_operations(1, 10, 1000);
  const mmu = create_mmu(create_algorithm("FIFO"));
  let max_unloaded = 0;

  for (const operation of operations) {
    mmu.execute(operation);
    max_unloaded = Math.max(max_unloaded, mmu.get_metrics().unloaded_pages);
  }

  assert.ok(max_unloaded > 0, "no page ever went to disk");
});
