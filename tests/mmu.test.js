// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_mmu } from "../src/engine/mmu.js";
import { RAM_PAGES } from "../src/engine/types.js";

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
