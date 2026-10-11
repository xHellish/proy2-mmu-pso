// =============================================
// Imports
// ---------------------------------------------

import {
  PAGE_SIZE_BYTES,
  RAM_PAGES,
  HIT_COST_SECONDS,
  FAULT_COST_SECONDS,
  create_page,
} from "./types.js";

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
  // Reloj
  // ---------------------------------------------

  // Suma al reloj un hit: la pagina ya estaba en RAM
  function charge_hit() {
    stats.clock_seconds += HIT_COST_SECONDS;
    stats.page_hits++;
  }

  // Suma al reloj un fallo de pagina, que tambien cuenta como thrashing
  function charge_fault() {
    stats.clock_seconds += FAULT_COST_SECONDS;
    stats.thrashing_seconds += FAULT_COST_SECONDS;
    stats.page_faults++;
  }

  // =============================================
  // Manejo de la RAM
  // ---------------------------------------------

  // Busca el primer marco libre; devuelve null si la RAM esta llena
  function find_free_frame() {
    for (let frame_index = 0; frame_index < frames.length; frame_index++) {
      if (frames[frame_index] === null) {
        return frame_index;
      }
    }
    return null;
  }

  // Lista las paginas que estan en RAM en este momento
  function get_ram_pages() {
    const ram_pages = [];
    for (const page of frames) {
      if (page !== null) {
        ram_pages.push(page);
      }
    }
    return ram_pages;
  }

  // Manda una pagina de RAM a disco y le asigna una direccion de disco
  function evict_page(page) {
    // Paso 1: liberar el marco
    frames[page.frame] = null;
    page.in_ram = false;
    page.frame = null;

    // Paso 2: asignar direccion de disco
    page.disk_addr = next_disk_addr;
    next_disk_addr++;

    // Paso 3: avisar al algoritmo
    algorithm.on_unload(page);
  }

  // Trae una pagina a RAM; si no hay marco libre, desaloja la victima que elige el algoritmo
  function load_page(page, context) {
    // Paso 1: buscar un marco libre
    let frame_index = find_free_frame();

    // Paso 2: si la RAM esta llena, elegir una victima entre todas las paginas en RAM
    if (frame_index === null) {
      const candidates = get_ram_pages();
      const victim = algorithm.choose_victim(candidates, context);
      if (!candidates.includes(victim)) {
        throw new Error("Algorithm chose a victim page that is not in RAM");
      }
      frame_index = victim.frame;
      evict_page(victim);
    }

    // Paso 3: colocar la pagina en el marco
    page.in_ram = true;
    page.frame = frame_index;
    page.disk_addr = null;
    page.loaded_at = stats.clock_seconds;
    frames[frame_index] = page;

    // Paso 4: avisar al algoritmo
    algorithm.on_load(page, context);
  }

  // =============================================
  // Operaciones
  // ---------------------------------------------

  // new: crea las paginas del bloque en RAM y devuelve el ptr asignado
  function new_operation(pid, size, context) {
    // Paso 1: validar el proceso y el tamano
    if (killed_pids.has(pid)) {
      throw new Error(`Process ${pid} was already killed, it cannot request memory`);
    }
    if (!Number.isInteger(size) || size < 1) {
      throw new Error(`Invalid size for new: ${size}`);
    }

    // Paso 2: registrar al proceso y asignar el siguiente ptr, que nunca se reutiliza
    if (!symbol_table.has(pid)) {
      symbol_table.set(pid, new Set());
    }
    active_pids.add(pid);
    const ptr = next_ptr;
    next_ptr++;

    // Paso 3: calcular paginas y fragmentacion interna del bloque
    const page_count = Math.ceil(size / PAGE_SIZE_BYTES);
    const wasted_bytes = page_count * PAGE_SIZE_BYTES - size;
    fragmentation_by_ptr.set(ptr, wasted_bytes);
    stats.fragmentation_bytes += wasted_bytes;

    // Paso 4: registrar el ptr en el mapa de memoria y en la tabla de simbolos
    const ptr_pages = [];
    memory_map.set(ptr, ptr_pages);
    symbol_table.get(pid).add(ptr);

    // Paso 5: crear cada pagina en RAM; una pagina nueva siempre cuenta como fallo
    for (let page_index = 0; page_index < page_count; page_index++) {
      const page = create_page(next_page_id, pid, ptr);
      next_page_id++;
      pages.set(page.id, page);
      ptr_pages.push(page);
      charge_fault();
      load_page(page, context);
    }

    return ptr;
  }

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
    // Paso 1: el contexto le dice al algoritmo en que operacion estamos
    const context = { operation_index: operations_executed };
    let result = null;

    // Paso 2: despachar segun el tipo de operacion
    if (operation.type === "new") {
      result = new_operation(operation.pid, operation.size, context);
      if (result !== operation.ptr) {
        throw new Error(`MMU assigned ptr ${result} but the operation expects ptr ${operation.ptr}`);
      }
    } else {
      throw new Error(`Operation ${operation.type} is not implemented yet`);
    }

    // Paso 3: contar la operacion ejecutada
    operations_executed++;
    return result;
  }

  return { execute, get_metrics, get_pages, get_frames };
}
