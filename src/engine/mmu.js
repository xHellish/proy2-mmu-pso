// =============================================
// Imports
// ---------------------------------------------

import { PAGE_SIZE_BYTES, RAM_PAGES } from "./types.js";

// =============================================
// Constantes
// ---------------------------------------------

// Interfaz que debe cumplir todo algoritmo de reemplazo
const REQUIRED_ALGORITHM_HOOKS = ["on_load", "on_access", "on_unload", "choose_victim"];
const PAGE_SIZE_KB = PAGE_SIZE_BYTES / 1024;

// =============================================
// MMU
// ---------------------------------------------

// Crea una MMU que usa el algoritmo de reemplazo recibido
export function create_mmu(algorithm) {
  // Paso 1: validar que el algoritmo cumpla la interfaz
  if (algorithm === null || typeof algorithm !== "object") {
    throw new Error("MMU requires an algorithm object");
  }
  for (const hook_name of REQUIRED_ALGORITHM_HOOKS) {
    if (typeof algorithm[hook_name] !== "function") {
      throw new Error(`Algorithm is missing the ${hook_name} function`);
    }
  }

  // Paso 2: estructuras de la MMU
  // frames: RAM, un marco por posicion con la pagina que lo ocupa (o null)
  // pages: todas las paginas existentes, en RAM o en disco, por id
  // memory_map: ptr -> lista de paginas
  // symbol_table: pid -> conjunto de ptr del proceso
  const frames = new Array(RAM_PAGES).fill(null);
  const pages = new Map();
  const memory_map = new Map();
  const symbol_table = new Map();
  const fragmentation_by_ptr = new Map();
  const active_pids = new Set();
  const killed_pids = new Set();

  // Paso 3: reloj y contadores de la simulacion
  const stats = {
    clock_seconds: 0,
    thrashing_seconds: 0,
    fragmentation_bytes: 0,
    page_hits: 0,
    page_faults: 0,
  };

  // Paso 4: contadores globales; el ptr nunca se reutiliza
  let next_ptr = 1;
  let next_page_id = 1;
  let next_disk_addr = 1;
  let operations_executed = 0;

  // =============================================
  // Consultas del estado
  // ---------------------------------------------

  // Devuelve los indicadores que muestra la interfaz
  function get_metrics() {
    // Paso 1: contar paginas en RAM y en disco
    let loaded_pages = 0;
    for (const page of pages.values()) {
      if (page.in_ram) {
        loaded_pages++;
      }
    }
    const unloaded_pages = pages.size - loaded_pages;

    // Paso 2: porcentaje de thrashing sobre el tiempo total
    let thrashing_percent = 0;
    if (stats.clock_seconds > 0) {
      thrashing_percent = (stats.thrashing_seconds / stats.clock_seconds) * 100;
    }

    // Paso 3: la V-RAM se mide como porcentaje de la RAM, puede pasar de 100
    return {
      clock_seconds: stats.clock_seconds,
      active_processes: active_pids.size,
      loaded_pages,
      unloaded_pages,
      ram_kb: loaded_pages * PAGE_SIZE_KB,
      ram_percent: (loaded_pages / RAM_PAGES) * 100,
      vram_kb: unloaded_pages * PAGE_SIZE_KB,
      vram_percent: (unloaded_pages / RAM_PAGES) * 100,
      thrashing_seconds: stats.thrashing_seconds,
      thrashing_percent,
      fragmentation_bytes: stats.fragmentation_bytes,
      page_hits: stats.page_hits,
      page_faults: stats.page_faults,
    };
  }

  // Devuelve una copia de todas las paginas existentes ordenadas por id
  function get_pages() {
    const page_list = [];
    for (const page of pages.values()) {
      page_list.push({ ...page });
    }
    return page_list;
  }

  // Devuelve la RAM marco por marco: null si esta libre o los datos de la pagina que lo ocupa
  function get_frames() {
    const frame_list = [];
    for (const page of frames) {
      if (page === null) {
        frame_list.push(null);
      } else {
        frame_list.push({ page_id: page.id, pid: page.pid, ptr: page.ptr });
      }
    }
    return frame_list;
  }

  // =============================================
  // Ejecucion de operaciones
  // ---------------------------------------------

  // Ejecuta una operacion completa; new devuelve el ptr asignado y las demas null
  function execute(operation) {
    throw new Error(`Operation ${operation.type} is not implemented yet`);
  }

  return { execute, get_metrics, get_pages, get_frames };
}
