// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_fifo_algorithm } from "../src/engine/algorithms/fifo.js";
import { create_page } from "../src/engine/types.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

// Crea una pagina en RAM con el id y el instante de carga dados
function create_loaded_page(id, loaded_at) {
  const page = create_page(id, 1, 1);
  page.in_ram = true;
  page.loaded_at = loaded_at;
  return page;
}

// =============================================
// Tests de FIFO
// ---------------------------------------------

test("FIFO evicts the page with the lowest loaded_at", () => {
  const fifo = create_fifo_algorithm();
  const candidates = [
    create_loaded_page(1, 30),
    create_loaded_page(2, 10),
    create_loaded_page(3, 20),
  ];

  assert.equal(fifo.choose_victim(candidates, {}).id, 2);
});

test("FIFO ignores accesses to a page", () => {
  const fifo = create_fifo_algorithm();
  const old_page = create_loaded_page(1, 5);
  const new_page = create_loaded_page(2, 10);

  fifo.on_access(old_page, {});
  fifo.on_access(old_page, {});

  assert.equal(fifo.choose_victim([new_page, old_page], {}).id, 1);
});

test("FIFO breaks a tie with the lowest page id", () => {
  const fifo = create_fifo_algorithm();
  const candidates = [create_loaded_page(7, 10), create_loaded_page(4, 10)];

  assert.equal(fifo.choose_victim(candidates, {}).id, 4);
});

test("FIFO rejects an empty candidate list", () => {
  const fifo = create_fifo_algorithm();

  assert.throws(() => fifo.choose_victim([], {}), /no tiene candidatos para desalojar/);
});
