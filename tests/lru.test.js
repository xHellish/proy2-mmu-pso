// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_mmu } from "../src/engine/mmu.js";
import { create_lru_algorithm } from "../src/engine/algorithms/lru.js";
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
// Tests unitarios de LRU
// ---------------------------------------------

test("LRU gives every loaded page a different last_use", () => {
  const lru = create_lru_algorithm();
  const page_1 = load_page_into(lru, 1);
  const page_2 = load_page_into(lru, 2);

  assert.equal(page_1.last_use, 1);
  assert.equal(page_2.last_use, 2);
});

test("LRU evicts the page that was loaded longest ago when nothing is accessed", () => {
  const lru = create_lru_algorithm();
  const pages = [load_page_into(lru, 1), load_page_into(lru, 2), load_page_into(lru, 3)];

  assert.equal(lru.choose_victim(pages, {}).id, 1);
});

test("LRU evicts the least recently used page, not the oldest one", () => {
  const lru = create_lru_algorithm();
  const page_1 = load_page_into(lru, 1);
  const page_2 = load_page_into(lru, 2);
  const page_3 = load_page_into(lru, 3);

  lru.on_access(page_1, {});

  assert.equal(lru.choose_victim([page_1, page_2, page_3], {}).id, 2);
});

test("LRU keeps updating the order with repeated accesses", () => {
  const lru = create_lru_algorithm();
  const page_1 = load_page_into(lru, 1);
  const page_2 = load_page_into(lru, 2);

  lru.on_access(page_1, {});
  lru.on_access(page_2, {});
  lru.on_access(page_1, {});

  assert.equal(lru.choose_victim([page_1, page_2], {}).id, 2);
});

test("each LRU instance has its own access counter", () => {
  const first_lru = create_lru_algorithm();
  const second_lru = create_lru_algorithm();
  load_page_into(first_lru, 1);
  load_page_into(first_lru, 2);

  const page = load_page_into(second_lru, 3);

  assert.equal(page.last_use, 1);
});

test("LRU rejects an empty candidate list", () => {
  const lru = create_lru_algorithm();

  assert.throws(() => lru.choose_victim([], {}), /no candidates to evict/);
});

// =============================================
// LRU dentro de la MMU
// ---------------------------------------------

test("in the MMU, LRU spares an accessed page that FIFO would evict", () => {
  const mmu = create_mmu(create_lru_algorithm());
  mmu.execute(create_operation("new", 1, 1, PAGE_SIZE_BYTES));
  mmu.execute(create_operation("new", 2, 2, 99 * PAGE_SIZE_BYTES));

  // La pagina 1 es la mas vieja, pero se accede justo antes de pedir otra pagina
  mmu.execute(create_operation("use", 1, 1, null));
  mmu.execute(create_operation("new", 3, 3, PAGE_SIZE_BYTES));
  const pages = mmu.get_pages();

  assert.equal(pages[0].in_ram, true);
  assert.equal(pages[1].in_ram, false);
});

test("in the MMU, use refreshes every page of the ptr in order", () => {
  const mmu = create_mmu(create_lru_algorithm());
  mmu.execute(create_operation("new", 1, 1, 3 * PAGE_SIZE_BYTES));
  mmu.execute(create_operation("use", 1, 1, null));
  const pages = mmu.get_pages();

  assert.deepEqual([pages[0].last_use, pages[1].last_use, pages[2].last_use], [4, 5, 6]);
});
