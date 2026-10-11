// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_mmu } from "../src/engine/mmu.js";
import { create_fifo_algorithm } from "../src/engine/algorithms/fifo.js";
import { RAM_PAGES, PAGE_SIZE_BYTES, create_operation } from "../src/engine/types.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

// Algoritmo minimo que cumple la interfaz, solo para probar las estructuras
function create_dummy_algorithm() {
  // No lleva estado, por eso los avisos de carga, acceso y descarga no hacen nada
  function do_nothing() {}

  // Elige siempre al primer candidato
  function choose_first(candidates) {
    return candidates[0];
  }

  return {
    on_load: do_nothing,
    on_access: do_nothing,
    on_unload: do_nothing,
    choose_victim: choose_first,
  };
}

// =============================================
// Estructuras base de la MMU
// ---------------------------------------------

test("a new MMU has an empty RAM of 100 frames", () => {
  const mmu = create_mmu(create_dummy_algorithm());
  const frames = mmu.get_frames();

  assert.equal(frames.length, RAM_PAGES);
  for (const frame of frames) {
    assert.equal(frame, null);
  }
});

test("a new MMU has no pages", () => {
  const mmu = create_mmu(create_dummy_algorithm());

  assert.deepEqual(mmu.get_pages(), []);
});

test("a new MMU starts with all metrics in zero", () => {
  const mmu = create_mmu(create_dummy_algorithm());

  assert.deepEqual(mmu.get_metrics(), {
    clock_seconds: 0,
    active_processes: 0,
    loaded_pages: 0,
    unloaded_pages: 0,
    ram_kb: 0,
    ram_percent: 0,
    vram_kb: 0,
    vram_percent: 0,
    thrashing_seconds: 0,
    thrashing_percent: 0,
    fragmentation_bytes: 0,
    page_hits: 0,
    page_faults: 0,
  });
});

test("create_mmu rejects a missing algorithm", () => {
  assert.throws(() => create_mmu(null), /requires an algorithm object/);
  assert.throws(() => create_mmu(undefined), /requires an algorithm object/);
});

test("create_mmu rejects an algorithm without the full interface", () => {
  const incomplete_algorithm = {
    on_load: () => {},
    on_access: () => {},
    on_unload: () => {},
  };

  assert.throws(() => create_mmu(incomplete_algorithm), /missing the choose_victim function/);
});

// =============================================
// Operacion new
// ---------------------------------------------

test("new creates one page in RAM and returns the ptr", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  const ptr = mmu.execute(create_operation("new", 1, 1, 500));
  const pages = mmu.get_pages();

  assert.equal(ptr, 1);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].pid, 1);
  assert.equal(pages[0].ptr, 1);
  assert.equal(pages[0].in_ram, true);
  assert.equal(pages[0].frame, 0);
  assert.deepEqual(mmu.get_frames()[0], { page_id: 1, pid: 1, ptr: 1 });
});

test("new counts the page as a fault and charges 5 seconds", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  mmu.execute(create_operation("new", 1, 1, 500));
  const metrics = mmu.get_metrics();

  assert.equal(metrics.clock_seconds, 5);
  assert.equal(metrics.thrashing_seconds, 5);
  assert.equal(metrics.thrashing_percent, 100);
  assert.equal(metrics.page_faults, 1);
  assert.equal(metrics.page_hits, 0);
  assert.equal(metrics.active_processes, 1);
  assert.equal(metrics.ram_kb, 4);
});

test("new sets loaded_at to the clock after the page is loaded", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  mmu.execute(create_operation("new", 1, 1, 3 * PAGE_SIZE_BYTES));
  const loaded_times = [];
  for (const page of mmu.get_pages()) {
    loaded_times.push(page.loaded_at);
  }

  assert.deepEqual(loaded_times, [5, 10, 15]);
});

test("new rounds the page count up and sums the internal fragmentation", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  mmu.execute(create_operation("new", 1, 1, 500));
  assert.equal(mmu.get_metrics().fragmentation_bytes, 3596);

  mmu.execute(create_operation("new", 1, 2, PAGE_SIZE_BYTES));
  assert.equal(mmu.get_metrics().fragmentation_bytes, 3596);
  assert.equal(mmu.get_pages().length, 2);

  mmu.execute(create_operation("new", 1, 3, PAGE_SIZE_BYTES + 1));
  assert.equal(mmu.get_metrics().fragmentation_bytes, 3596 + 4095);
  assert.equal(mmu.get_pages().length, 4);
});

test("new gives sequential ptrs and registers every page of the ptr", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  assert.equal(mmu.execute(create_operation("new", 1, 1, 10)), 1);
  assert.equal(mmu.execute(create_operation("new", 2, 2, 2 * PAGE_SIZE_BYTES)), 2);

  const ptr_two_pages = [];
  for (const page of mmu.get_pages()) {
    if (page.ptr === 2) {
      ptr_two_pages.push(page.id);
    }
  }
  assert.deepEqual(ptr_two_pages, [2, 3]);
  assert.equal(mmu.get_metrics().active_processes, 2);
});

test("new fills the RAM without evicting while there are free frames", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  mmu.execute(create_operation("new", 1, 1, RAM_PAGES * PAGE_SIZE_BYTES));
  const metrics = mmu.get_metrics();

  assert.equal(metrics.loaded_pages, 100);
  assert.equal(metrics.unloaded_pages, 0);
  assert.equal(metrics.ram_percent, 100);
  assert.equal(metrics.clock_seconds, 500);
});

test("new evicts the oldest page with FIFO when the RAM is full", () => {
  const mmu = create_mmu(create_fifo_algorithm());
  mmu.execute(create_operation("new", 1, 1, RAM_PAGES * PAGE_SIZE_BYTES));

  mmu.execute(create_operation("new", 2, 2, PAGE_SIZE_BYTES));
  const pages = mmu.get_pages();
  const metrics = mmu.get_metrics();

  assert.equal(pages[0].in_ram, false);
  assert.equal(pages[0].frame, null);
  assert.equal(pages[0].disk_addr, 1);
  assert.equal(pages[100].in_ram, true);
  assert.equal(pages[100].frame, 0);
  assert.equal(metrics.loaded_pages, 100);
  assert.equal(metrics.unloaded_pages, 1);
  assert.equal(metrics.vram_kb, 4);
  assert.equal(metrics.vram_percent, 1);
});

test("new of more than 100 pages evicts its own pages", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  mmu.execute(create_operation("new", 1, 1, 410000));
  const pages = mmu.get_pages();
  const metrics = mmu.get_metrics();

  assert.equal(pages.length, 101);
  assert.equal(pages[0].in_ram, false);
  assert.equal(pages[100].in_ram, true);
  assert.equal(metrics.loaded_pages, 100);
  assert.equal(metrics.unloaded_pages, 1);
  assert.equal(metrics.clock_seconds, 505);
  assert.equal(metrics.thrashing_seconds, 505);
  assert.equal(metrics.fragmentation_bytes, 3696);
});

test("new rejects an invalid size", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  assert.throws(() => mmu.execute(create_operation("new", 1, 1, 0)), /Invalid size for new/);
  assert.throws(() => mmu.execute(create_operation("new", 1, 1, 2.5)), /Invalid size for new/);
});

test("new rejects an operation whose ptr does not match the assigned one", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  assert.throws(
    () => mmu.execute(create_operation("new", 1, 7, 10)),
    /assigned ptr 1 but the operation expects ptr 7/,
  );
});

test("execute rejects operations that are not implemented yet", () => {
  const mmu = create_mmu(create_fifo_algorithm());

  assert.throws(() => mmu.execute(create_operation("delete", 1, 1, null)), /not implemented yet/);
});

// =============================================
// Operacion use
// ---------------------------------------------

test("use of a page in RAM is a hit and charges 1 second", () => {
  const mmu = create_mmu(create_fifo_algorithm());
  mmu.execute(create_operation("new", 1, 1, 500));

  mmu.execute(create_operation("use", 1, 1, null));
  const metrics = mmu.get_metrics();

  assert.equal(metrics.clock_seconds, 6);
  assert.equal(metrics.page_hits, 1);
  assert.equal(metrics.page_faults, 1);
  assert.equal(metrics.thrashing_seconds, 5);
});

test("use of a ptr with several pages charges 1 second per page", () => {
  const mmu = create_mmu(create_fifo_algorithm());
  mmu.execute(create_operation("new", 1, 1, 3 * PAGE_SIZE_BYTES));

  mmu.execute(create_operation("use", 1, 1, null));
  const metrics = mmu.get_metrics();

  assert.equal(metrics.clock_seconds, 15 + 3);
  assert.equal(metrics.page_hits, 3);
});

test("use of a page on disk is a fault, loads it and evicts the oldest page", () => {
  const mmu = create_mmu(create_fifo_algorithm());
  mmu.execute(create_operation("new", 1, 1, PAGE_SIZE_BYTES));
  mmu.execute(create_operation("new", 2, 2, RAM_PAGES * PAGE_SIZE_BYTES));
  const before = mmu.get_pages();
  assert.equal(before[0].in_ram, false);

  mmu.execute(create_operation("use", 1, 1, null));
  const after = mmu.get_pages();
  const metrics = mmu.get_metrics();

  assert.equal(after[0].in_ram, true);
  assert.equal(after[0].disk_addr, null);
  assert.equal(after[1].in_ram, false);
  assert.equal(metrics.clock_seconds, 5 + 500 + 5);
  assert.equal(metrics.thrashing_seconds, 510);
  assert.equal(metrics.page_hits, 0);
  assert.equal(metrics.loaded_pages, 100);
  assert.equal(metrics.unloaded_pages, 1);
});

test("use of a ptr larger than the RAM faults on every page with FIFO", () => {
  const mmu = create_mmu(create_fifo_algorithm());
  mmu.execute(create_operation("new", 1, 1, 410000));

  mmu.execute(create_operation("use", 1, 1, null));
  const metrics = mmu.get_metrics();

  assert.equal(metrics.page_faults, 101 + 101);
  assert.equal(metrics.page_hits, 0);
  assert.equal(metrics.clock_seconds, 505 + 505);
});

test("use rejects a ptr that the process does not own", () => {
  const mmu = create_mmu(create_fifo_algorithm());
  mmu.execute(create_operation("new", 1, 1, 10));

  assert.throws(() => mmu.execute(create_operation("use", 2, 1, null)), /Process 2 does not own ptr 1/);
  assert.throws(() => mmu.execute(create_operation("use", 1, 9, null)), /Process 1 does not own ptr 9/);
});
