// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { create_mmu } from "../src/engine/mmu.js";
import { create_fifo_algorithm } from "../src/engine/algorithms/fifo.js";
import { parse_operations } from "../src/engine/parser.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

const ANEXO_1_TEXT = readFileSync(new URL("../examples/anexo1.txt", import.meta.url), "utf8");

// Ejecuta un texto de operaciones en una MMU nueva con FIFO y devuelve la MMU
function run_trace(text) {
  const mmu = create_mmu(create_fifo_algorithm());
  for (const operation of parse_operations(text)) {
    mmu.execute(operation);
  }
  return mmu;
}

// Repite una operacion en texto el numero de veces dado
function repeat_text(line, times) {
  let text = "";
  for (let index = 0; index < times; index++) {
    text += line + "\n";
  }
  return text;
}

// =============================================
// Traza del Anexo 1 con FIFO, calculada a mano
// ---------------------------------------------

test("Annex 1 trace: state after the first ten operations", () => {
  const mmu = create_mmu(create_fifo_algorithm());
  const operations = parse_operations(ANEXO_1_TEXT);

  for (const operation of operations.slice(0, 10)) {
    mmu.execute(operation);
  }
  const metrics = mmu.get_metrics();

  // 4 new (4 x 5s) + 6 use (6 x 1s)
  assert.equal(metrics.clock_seconds, 26);
  assert.equal(metrics.page_faults, 4);
  assert.equal(metrics.page_hits, 6);
  assert.equal(metrics.thrashing_seconds, 20);
  assert.equal(metrics.active_processes, 2);
  assert.equal(metrics.loaded_pages, 4);
  assert.equal(metrics.unloaded_pages, 0);
  assert.equal(metrics.ram_kb, 16);
  assert.equal(metrics.fragmentation_bytes, 3596 + 3096 + 3596 + 4046);
});

test("Annex 1 trace: state after delete(1)", () => {
  const mmu = create_mmu(create_fifo_algorithm());
  const operations = parse_operations(ANEXO_1_TEXT);

  for (const operation of operations.slice(0, 11)) {
    mmu.execute(operation);
  }
  const metrics = mmu.get_metrics();

  assert.equal(metrics.clock_seconds, 26);
  assert.equal(metrics.loaded_pages, 3);
  assert.equal(metrics.fragmentation_bytes, 3096 + 3596 + 4046);
});

test("Annex 1 trace: final state", () => {
  const mmu = run_trace(ANEXO_1_TEXT);
  const metrics = mmu.get_metrics();

  assert.equal(metrics.clock_seconds, 28);
  assert.equal(metrics.page_hits, 8);
  assert.equal(metrics.page_faults, 4);
  assert.equal(metrics.thrashing_seconds, 20);
  assert.equal(metrics.active_processes, 0);
  assert.equal(metrics.loaded_pages, 0);
  assert.equal(metrics.unloaded_pages, 0);
  assert.equal(metrics.fragmentation_bytes, 0);
  assert.deepEqual(mmu.get_pages(), []);
});

// =============================================
// Trazas con reemplazo de paginas
// ---------------------------------------------

test("use mixing hits and a fault charges 7 seconds like the statement", () => {
  // ptr 1 de 3 paginas; ptr 2 llena la RAM; ptr 3 desaloja la pagina 1 de ptr 1; delete libera un marco
  const mmu = run_trace("new(1,12288)\nnew(2,397312)\nnew(3,4096)\ndelete(3)");
  const before = mmu.get_metrics();
  assert.equal(before.clock_seconds, 15 + 485 + 5);

  const operations = parse_operations("new(1,12288)\nnew(2,397312)\nnew(3,4096)\ndelete(3)\nuse(1)");
  mmu.execute(operations[4]);
  const after = mmu.get_metrics();

  // 1 fallo (5s) + 2 hits (1s cada uno)
  assert.equal(after.clock_seconds - before.clock_seconds, 7);
  assert.equal(after.page_faults - before.page_faults, 1);
  assert.equal(after.page_hits - before.page_hits, 2);
});

test("FIFO evicts pages in load order across several news", () => {
  const mmu = run_trace("new(1,4096)\nnew(2,401408)");
  const pages = mmu.get_pages();

  // ptr 2 tiene 98 paginas: con la de ptr 1 son 99 y caben; ninguna se desaloja
  assert.equal(pages.length, 99);
  assert.equal(mmu.get_metrics().unloaded_pages, 0);

  const more = run_trace("new(1,4096)\nnew(2,409600)\nnew(3,4096)");
  const more_pages = more.get_pages();

  // 1 + 100 + 1 = 102 paginas: se desalojan las dos primeras, ambas cargadas antes
  assert.equal(more_pages.length, 102);
  assert.equal(more_pages[0].in_ram, false);
  assert.equal(more_pages[1].in_ram, false);
  assert.equal(more_pages[2].in_ram, true);
  assert.equal(more.get_metrics().unloaded_pages, 2);
});

test("a large trace keeps the RAM at 100 pages and the metrics consistent", () => {
  const text = repeat_text("new(1,40960)", 30) + repeat_text("use(1)", 1) + "kill(1)\n";
  const mmu = run_trace(text);
  const metrics = mmu.get_metrics();

  // 30 bloques de 10 paginas = 300 paginas creadas; kill las borra todas
  assert.equal(metrics.page_faults >= 300, true);
  assert.equal(metrics.loaded_pages, 0);
  assert.equal(metrics.unloaded_pages, 0);
  assert.equal(metrics.fragmentation_bytes, 0);
  assert.equal(metrics.thrashing_seconds, metrics.page_faults * 5);
  assert.equal(metrics.clock_seconds, metrics.page_faults * 5 + metrics.page_hits);
});

test("the RAM never holds more than 100 pages during a heavy trace", () => {
  const mmu = create_mmu(create_fifo_algorithm());
  const text = repeat_text("new(1,40960)", 30) + repeat_text("use(1)", 1);

  for (const operation of parse_operations(text)) {
    mmu.execute(operation);
    assert.ok(mmu.get_metrics().loaded_pages <= 100);
  }
});
