// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_mmu } from "../src/engine/mmu.js";
import { create_opt_algorithm } from "../src/engine/algorithms/opt.js";
import { parse_operations } from "../src/engine/parser.js";
import { create_page, create_operation } from "../src/engine/types.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

// Crea una pagina en RAM de un ptr con el instante de carga dado
function create_ram_page(id, ptr, loaded_at) {
  const page = create_page(id, 1, ptr);
  page.in_ram = true;
  page.loaded_at = loaded_at;
  return page;
}

// Crea un use de un ptr del proceso 1
function use_of(ptr) {
  return create_operation("use", 1, ptr, null);
}

// Operaciones de relleno que no son use, para ocupar indices
function filler() {
  return create_operation("new", 1, 1, 10);
}

// =============================================
// Tests unitarios de OPT
// ---------------------------------------------

test("OPT evicts the page whose ptr is used farthest in the future", () => {
  // indices: 0 filler, 1 use(1), 2 use(2), 3 use(3)
  const opt = create_opt_algorithm([filler(), use_of(1), use_of(2), use_of(3)]);
  const candidates = [
    create_ram_page(1, 1, 5),
    create_ram_page(2, 2, 10),
    create_ram_page(3, 3, 15),
  ];

  assert.equal(opt.choose_victim(candidates, { operation_index: 0 }).id, 3);
});

test("OPT prefers a page that is never used again over one used later", () => {
  const opt = create_opt_algorithm([filler(), use_of(1), use_of(1), use_of(1)]);
  const candidates = [create_ram_page(1, 1, 5), create_ram_page(2, 2, 10)];

  assert.equal(opt.choose_victim(candidates, { operation_index: 0 }).id, 2);
});

test("OPT ignores uses at or before the current operation", () => {
  // ptr 1 se usa en 1 y 5; ptr 2 se usa en 3. En la operacion 3 el siguiente de ptr 1 es 5
  const operations = [filler(), use_of(1), filler(), use_of(2), filler(), use_of(1)];
  const opt = create_opt_algorithm(operations);
  const candidates = [create_ram_page(1, 1, 5), create_ram_page(2, 2, 10)];

  assert.equal(opt.choose_victim(candidates, { operation_index: 3 }).id, 2);
  assert.equal(opt.choose_victim(candidates, { operation_index: 1 }).id, 1);
});

test("OPT treats a ptr with no remaining use as infinite distance", () => {
  const opt = create_opt_algorithm([use_of(1), use_of(2)]);
  const candidates = [create_ram_page(1, 1, 5), create_ram_page(2, 2, 10)];

  // Despues de la operacion 1 ya no queda ningun use: gana el desempate FIFO
  assert.equal(opt.choose_victim(candidates, { operation_index: 1 }).id, 1);
});

test("OPT breaks a tie with the oldest loaded_at, then the lowest id", () => {
  const opt = create_opt_algorithm([filler(), use_of(1)]);
  const newer = create_ram_page(1, 5, 20);
  const older = create_ram_page(2, 6, 10);
  const same_time_high_id = create_ram_page(9, 7, 10);

  assert.equal(opt.choose_victim([newer, older], { operation_index: 0 }).id, 2);
  assert.equal(opt.choose_victim([same_time_high_id, older], { operation_index: 0 }).id, 2);
});

test("OPT breaks a tie between pages of the same ptr with FIFO", () => {
  const opt = create_opt_algorithm([filler(), use_of(1)]);
  const candidates = [create_ram_page(3, 1, 15), create_ram_page(1, 1, 5), create_ram_page(2, 1, 10)];

  assert.equal(opt.choose_victim(candidates, { operation_index: 0 }).id, 1);
});

test("OPT rejects a missing operation list, an empty candidate list and a missing context", () => {
  assert.throws(() => create_opt_algorithm(null), /requires the full list of operations/);

  const opt = create_opt_algorithm([filler()]);
  assert.throws(() => opt.choose_victim([], { operation_index: 0 }), /no candidates to evict/);
  assert.throws(() => opt.choose_victim([create_ram_page(1, 1, 5)], {}), /needs the current operation_index/);
});

// =============================================
// OPT dentro de la MMU
// ---------------------------------------------

// Ejecuta un texto de operaciones con OPT y devuelve la MMU
function run_opt(text) {
  const operations = parse_operations(text);
  const mmu = create_mmu(create_opt_algorithm(operations));
  for (const operation of operations) {
    mmu.execute(operation);
  }
  return mmu;
}

test("in the MMU, OPT evicts the page whose ptr is used last", () => {
  // Op 3 llena la RAM: ptr 1 se usa en la op 5, ptr 2 en la op 4 y ptr 3 en la op 6
  const text = [
    "new(1,4096)",
    "new(2,4096)",
    "new(3,401408)",
    "new(4,4096)",
    "use(2)",
    "use(1)",
    "kill(1)",
    "kill(2)",
    "kill(3)",
    "kill(4)",
  ].join("\n");
  const operations = parse_operations(text);
  const mmu = create_mmu(create_opt_algorithm(operations));

  for (const operation of operations.slice(0, 4)) {
    mmu.execute(operation);
  }
  const pages = mmu.get_pages();

  // ptr 3 no se vuelve a usar nunca: su pagina mas vieja (id 3) es la victima
  assert.equal(pages[2].in_ram, false);
  assert.equal(pages[0].in_ram, true);
  assert.equal(pages[1].in_ram, true);
});

test("in the MMU, OPT evicts the ptr with the farthest finite next use", () => {
  const text = [
    "new(1,4096)",
    "new(2,4096)",
    "new(3,401408)",
    "new(4,4096)",
    "use(1)",
    "use(2)",
    "use(3)",
  ].join("\n");
  const operations = parse_operations(text);
  const mmu = create_mmu(create_opt_algorithm(operations));

  for (const operation of operations.slice(0, 4)) {
    mmu.execute(operation);
  }
  const pages = mmu.get_pages();

  // ptr 1 se usa en la op 4, ptr 2 en la 5 y ptr 3 (98 paginas) en la 6, el mas lejano: sale su pagina mas vieja
  assert.equal(pages[0].in_ram, true);
  assert.equal(pages[1].in_ram, true);
  assert.equal(pages[2].in_ram, false);
});

test("in the MMU, OPT runs the Annex 1 trace with the same clock as FIFO when nothing is evicted", () => {
  const annex_text = [
    "new(1,500)",
    "use(1)",
    "new(1,1000)",
    "use(1)",
    "use(2)",
    "new(2,500)",
    "use(3)",
    "use(1)",
    "new(2,50)",
    "use(4)",
    "delete(1)",
    "use(2)",
    "use(3)",
    "delete(2)",
    "kill(1)",
    "kill(2)",
  ].join("\n");
  const metrics = run_opt(annex_text).get_metrics();

  assert.equal(metrics.clock_seconds, 28);
  assert.equal(metrics.page_hits, 8);
  assert.equal(metrics.page_faults, 4);
});
