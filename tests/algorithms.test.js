// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { create_mmu } from "../src/engine/mmu.js";
import { create_algorithm, create_opt_algorithm } from "../src/engine/algorithms/index.js";
import { parse_operations } from "../src/engine/parser.js";
import { create_rng, random_int } from "../src/engine/rng.js";
import { VALID_ALGORITHMS, PAGE_SIZE_BYTES } from "../src/engine/types.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

const ANEXO_1_TEXT = readFileSync(new URL("../examples/anexo1.txt", import.meta.url), "utf8");
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 2024, 31337, 65535];

// Ejecuta una lista de operaciones con el algoritmo dado y devuelve las metricas finales
function run_with(algorithm, operations) {
  const mmu = create_mmu(algorithm);
  for (const operation of operations) {
    mmu.execute(operation);
  }
  return mmu.get_metrics();
}

// Genera un texto de operaciones valido y repetible; los bloques son de una sola pagina
function build_trace(seed, process_count, operation_count) {
  const next_random = create_rng(seed);
  const lines = [];
  const live_ptrs_by_pid = new Map();
  let next_ptr = 1;

  // Paso 1: cada proceso empieza sin punteros
  for (let pid = 1; pid <= process_count; pid++) {
    live_ptrs_by_pid.set(pid, []);
  }

  // Paso 2: elegir un proceso al azar y una operacion valida para el
  for (let step = 0; step < operation_count; step++) {
    const pid = random_int(next_random, 1, process_count);
    const live_ptrs = live_ptrs_by_pid.get(pid);
    const roll = random_int(next_random, 1, 100);

    if (live_ptrs.length === 0 || roll <= 40) {
      const size = random_int(next_random, 1, PAGE_SIZE_BYTES);
      lines.push(`new(${pid},${size})`);
      live_ptrs.push(next_ptr);
      next_ptr++;
    } else if (roll <= 90) {
      const ptr = live_ptrs[random_int(next_random, 0, live_ptrs.length - 1)];
      lines.push(`use(${ptr})`);
    } else {
      const position = random_int(next_random, 0, live_ptrs.length - 1);
      lines.push(`delete(${live_ptrs[position]})`);
      live_ptrs.splice(position, 1);
    }
  }

  // Paso 3: terminar todos los procesos
  for (let pid = 1; pid <= process_count; pid++) {
    lines.push(`kill(${pid})`);
  }

  return lines.join("\n") + "\n";
}

// =============================================
// Registro de algoritmos
// ---------------------------------------------

test("create_algorithm builds every algorithm the user can choose", () => {
  for (const name of VALID_ALGORITHMS) {
    assert.equal(create_algorithm(name).name, name);
  }
});

test("create_algorithm rejects an unknown algorithm", () => {
  assert.throws(() => create_algorithm("MRU"), /Unknown algorithm: MRU/);
});

test("every algorithm gives independent state per instance", () => {
  for (const name of VALID_ALGORITHMS) {
    const first = create_mmu(create_algorithm(name));
    const second = create_mmu(create_algorithm(name));
    const operations = parse_operations("new(1,100)\nuse(1)");

    for (const operation of operations) {
      first.execute(operation);
    }

    assert.equal(second.get_metrics().clock_seconds, 0);
  }
});

// =============================================
// Comparacion entre algoritmos
// ---------------------------------------------

test("all algorithms agree on the Annex 1 trace because nothing is evicted", () => {
  const operations = parse_operations(ANEXO_1_TEXT);
  const expected = run_with(create_opt_algorithm(operations), operations);

  for (const name of VALID_ALGORITHMS) {
    const metrics = run_with(create_algorithm(name), operations);
    assert.deepEqual(metrics, expected, `${name} differs from OPT on the Annex 1 trace`);
  }
  assert.equal(expected.clock_seconds, 28);
});

test("OPT never has more faults or time than any other algorithm", () => {
  for (const seed of SEEDS) {
    const operations = parse_operations(build_trace(seed, 10, 600));
    const opt_metrics = run_with(create_opt_algorithm(operations), operations);

    for (const name of VALID_ALGORITHMS) {
      const metrics = run_with(create_algorithm(name), operations);
      const label = `seed ${seed}, ${name}`;
      assert.ok(opt_metrics.page_faults <= metrics.page_faults, `${label}: faults`);
      assert.ok(opt_metrics.clock_seconds <= metrics.clock_seconds, `${label}: clock`);
      assert.ok(opt_metrics.thrashing_seconds <= metrics.thrashing_seconds, `${label}: thrashing`);
    }
  }
});

test("the generated traces are heavy enough to force evictions", () => {
  let evicting_traces = 0;

  for (const seed of SEEDS) {
    const operations = parse_operations(build_trace(seed, 10, 600));
    const fifo_metrics = run_with(create_algorithm("FIFO"), operations);
    const opt_metrics = run_with(create_opt_algorithm(operations), operations);
    if (fifo_metrics.page_faults > opt_metrics.page_faults) {
      evicting_traces++;
    }
  }

  // Si ninguna traza hiciera reemplazos, la prueba de OPT no demostraria nada
  assert.ok(evicting_traces > 0);
});

test("every algorithm finishes a trace with an empty system", () => {
  const operations = parse_operations(build_trace(5, 10, 600));

  for (const name of VALID_ALGORITHMS) {
    const metrics = run_with(create_algorithm(name), operations);
    assert.equal(metrics.loaded_pages, 0, name);
    assert.equal(metrics.unloaded_pages, 0, name);
    assert.equal(metrics.active_processes, 0, name);
    assert.equal(metrics.fragmentation_bytes, 0, name);
  }
});

test("the RAM never holds more than 100 pages with any algorithm", () => {
  const operations = parse_operations(build_trace(11, 10, 600));

  for (const name of VALID_ALGORITHMS) {
    const mmu = create_mmu(create_algorithm(name));
    for (const operation of operations) {
      mmu.execute(operation);
      assert.ok(mmu.get_metrics().loaded_pages <= 100, name);
    }
  }
});
