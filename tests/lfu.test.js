// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_mmu } from "../src/engine/mmu.js";
import { create_lfu_algorithm } from "../src/engine/algorithms/lfu.js";
import { create_page, create_operation, PAGE_SIZE_BYTES } from "../src/engine/types.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

// Crea una pagina y la carga en el algoritmo con el instante de carga dado
function load_page_into(algorithm, id, loaded_at) {
  const page = create_page(id, 1, 1);
  page.in_ram = true;
  page.loaded_at = loaded_at;
  algorithm.on_load(page, {});
  return page;
}

// =============================================
// Tests unitarios de LFU
// ---------------------------------------------

test("LFU starts a loaded page at frequency 1", () => {
  const lfu = create_lfu_algorithm();
  const page = load_page_into(lfu, 1, 5);

  assert.equal(page.freq, 1);
});

test("LFU adds one to the frequency on every access", () => {
  const lfu = create_lfu_algorithm();
  const page = load_page_into(lfu, 1, 5);

  lfu.on_access(page, {});
  lfu.on_access(page, {});

  assert.equal(page.freq, 3);
});

test("LFU evicts the page with the lowest frequency", () => {
  const lfu = create_lfu_algorithm();
  const page_1 = load_page_into(lfu, 1, 5);
  const page_2 = load_page_into(lfu, 2, 10);
  const page_3 = load_page_into(lfu, 3, 15);
  lfu.on_access(page_1, {});
  lfu.on_access(page_1, {});
  lfu.on_access(page_2, {});

  assert.equal(lfu.choose_victim([page_1, page_2, page_3], {}).id, 3);
});

test("LFU breaks a frequency tie with the oldest loaded_at", () => {
  const lfu = create_lfu_algorithm();
  const newer = load_page_into(lfu, 1, 20);
  const older = load_page_into(lfu, 2, 10);

  assert.equal(lfu.choose_victim([newer, older], {}).id, 2);
});

test("LFU breaks a full tie with the lowest page id", () => {
  const lfu = create_lfu_algorithm();
  const page_7 = load_page_into(lfu, 7, 10);
  const page_4 = load_page_into(lfu, 4, 10);

  assert.equal(lfu.choose_victim([page_7, page_4], {}).id, 4);
});

test("LFU resets the frequency to 0 when a page goes to disk", () => {
  const lfu = create_lfu_algorithm();
  const page = load_page_into(lfu, 1, 5);
  lfu.on_access(page, {});
  lfu.on_access(page, {});

  lfu.on_unload(page);
  assert.equal(page.freq, 0);

  lfu.on_load(page, {});
  assert.equal(page.freq, 1);
});

test("LFU rejects an empty candidate list", () => {
  const lfu = create_lfu_algorithm();

  assert.throws(() => lfu.choose_victim([], {}), /no tiene candidatos para desalojar/);
});

// =============================================
// LFU dentro de la MMU
// ---------------------------------------------

test("in the MMU, LFU spares a frequently used page that FIFO would evict", () => {
  const mmu = create_mmu(create_lfu_algorithm());
  mmu.execute(create_operation("new", 1, 1, PAGE_SIZE_BYTES));
  mmu.execute(create_operation("new", 2, 2, 99 * PAGE_SIZE_BYTES));

  // La pagina 1 es la mas vieja, pero tiene frecuencia 2 y las demas 1
  mmu.execute(create_operation("use", 1, 1, null));
  mmu.execute(create_operation("new", 3, 3, PAGE_SIZE_BYTES));
  const pages = mmu.get_pages();

  assert.equal(pages[0].in_ram, true);
  assert.equal(pages[1].in_ram, false);
});

test("in the MMU, an evicted page comes back with frequency 1", () => {
  const mmu = create_mmu(create_lfu_algorithm());
  mmu.execute(create_operation("new", 1, 1, 100 * PAGE_SIZE_BYTES));
  mmu.execute(create_operation("new", 2, 2, PAGE_SIZE_BYTES));
  const evicted = mmu.get_pages()[0];
  assert.equal(evicted.in_ram, false);
  assert.equal(evicted.freq, 0);

  mmu.execute(create_operation("use", 1, 1, null));
  const reloaded = mmu.get_pages()[0];

  assert.equal(reloaded.in_ram, true);
  assert.equal(reloaded.freq, 1);
});
