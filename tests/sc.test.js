// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_mmu } from "../src/engine/mmu.js";
import { create_sc_algorithm } from "../src/engine/algorithms/sc.js";
import { create_page, create_operation, PAGE_SIZE_BYTES } from "../src/engine/types.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

// Crea una pagina y la carga en el algoritmo, como haria la MMU
function load_page_into(algorithm, id) {
  const page = create_page(id, 1, 1);
  page.in_ram = true;
  page.loaded_at = id * 5;
  algorithm.on_load(page, {});
  return page;
}

// =============================================
// Tests unitarios de SC
// ---------------------------------------------

test("SC sets the reference bit when a page is loaded", () => {
  const sc = create_sc_algorithm();
  const page = load_page_into(sc, 1);

  assert.equal(page.ref_bit, 1);
});

test("SC with every bit on clears them all and evicts the oldest page", () => {
  const sc = create_sc_algorithm();
  const pages = [load_page_into(sc, 1), load_page_into(sc, 2), load_page_into(sc, 3)];

  const victim = sc.choose_victim(pages, {});

  assert.equal(victim.id, 1);
  assert.deepEqual([pages[0].ref_bit, pages[1].ref_bit, pages[2].ref_bit], [0, 0, 0]);
});

test("SC gives a second chance to an accessed page", () => {
  const sc = create_sc_algorithm();
  const page_1 = load_page_into(sc, 1);
  const page_2 = load_page_into(sc, 2);
  const page_3 = load_page_into(sc, 3);

  // Primer desalojo: todos tienen bit 1, sale la pagina 1 y quedan con bit 0
  const first_victim = sc.choose_victim([page_1, page_2, page_3], {});
  sc.on_unload(first_victim);
  const page_4 = load_page_into(sc, 4);

  // La pagina 2 es la mas vieja, pero se accede y recibe su segunda oportunidad
  sc.on_access(page_2, {});
  const second_victim = sc.choose_victim([page_2, page_3, page_4], {});

  assert.equal(second_victim.id, 3);
  assert.equal(page_2.ref_bit, 0);
});

test("SC moves a page with bit 1 to the end of the queue", () => {
  const sc = create_sc_algorithm();
  const page_1 = load_page_into(sc, 1);
  const page_2 = load_page_into(sc, 2);
  sc.on_unload(sc.choose_victim([page_1, page_2], {}));
  const page_3 = load_page_into(sc, 3);
  sc.on_access(page_2, {});

  // La cola es [2 (bit 1), 3 (bit 1)]: ambas dan vuelta y sale la pagina 2 con bit 0
  const victim = sc.choose_victim([page_2, page_3], {});

  assert.equal(victim.id, 2);
});

test("SC removes an unloaded page from the queue and clears its bit", () => {
  const sc = create_sc_algorithm();
  const page_1 = load_page_into(sc, 1);
  const page_2 = load_page_into(sc, 2);

  sc.on_unload(page_1);

  assert.equal(page_1.ref_bit, 0);
  assert.equal(sc.choose_victim([page_2], {}).id, 2);
});

test("SC rejects unloading a page that is not in the queue", () => {
  const sc = create_sc_algorithm();
  const stranger = create_page(9, 1, 1);

  assert.throws(() => sc.on_unload(stranger), /not in the queue/);
});

test("SC detects a queue that is out of sync with the candidates", () => {
  const sc = create_sc_algorithm();
  const page_1 = load_page_into(sc, 1);
  load_page_into(sc, 2);

  assert.throws(() => sc.choose_victim([page_1], {}), /queue is out of sync/);
  assert.throws(() => sc.choose_victim([], {}), /no candidates to evict/);
});

// =============================================
// SC dentro de la MMU
// ---------------------------------------------

test("in the MMU, SC spares an accessed page that FIFO would evict", () => {
  const mmu = create_mmu(create_sc_algorithm());
  mmu.execute(create_operation("new", 1, 1, PAGE_SIZE_BYTES));
  mmu.execute(create_operation("new", 2, 2, PAGE_SIZE_BYTES));
  mmu.execute(create_operation("new", 3, 3, 98 * PAGE_SIZE_BYTES));

  // RAM llena con todos los bits en 1: sale la pagina 1 y el resto queda con bit 0
  mmu.execute(create_operation("new", 4, 4, PAGE_SIZE_BYTES));
  assert.equal(mmu.get_pages()[0].in_ram, false);

  // Se accede a la pagina 2, la mas vieja que queda, y se pide otra pagina
  mmu.execute(create_operation("use", 2, 2, null));
  mmu.execute(create_operation("new", 5, 5, PAGE_SIZE_BYTES));
  const pages = mmu.get_pages();

  assert.equal(pages[1].in_ram, true);
  assert.equal(pages[2].in_ram, false);
});

test("in the MMU, the MARK bit is cleared when a page goes to disk", () => {
  const mmu = create_mmu(create_sc_algorithm());
  mmu.execute(create_operation("new", 1, 1, 100 * PAGE_SIZE_BYTES));
  mmu.execute(create_operation("new", 2, 2, PAGE_SIZE_BYTES));
  const pages = mmu.get_pages();

  assert.equal(pages[0].in_ram, false);
  assert.equal(pages[0].ref_bit, 0);
});

test("in the MMU, delete and kill keep the SC queue in sync", () => {
  const mmu = create_mmu(create_sc_algorithm());
  mmu.execute(create_operation("new", 1, 1, 60 * PAGE_SIZE_BYTES));
  mmu.execute(create_operation("new", 2, 2, 40 * PAGE_SIZE_BYTES));
  mmu.execute(create_operation("delete", 1, 1, null));
  mmu.execute(create_operation("new", 3, 3, 60 * PAGE_SIZE_BYTES));

  assert.doesNotThrow(() => mmu.execute(create_operation("new", 3, 4, 10 * PAGE_SIZE_BYTES)));
  assert.doesNotThrow(() => mmu.execute(create_operation("kill", 3, null, null)));
  assert.doesNotThrow(() => mmu.execute(create_operation("new", 2, 5, 90 * PAGE_SIZE_BYTES)));
});
