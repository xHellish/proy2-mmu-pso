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
    throw new Error("La MMU requiere un objeto de algoritmo");
  }
  for (const hook_name of REQUIRED_ALGORITHM_HOOKS) {
    if (typeof algorithm[hook_name] !== "function") {
      throw new Error(`Al algoritmo le falta la función ${hook_name}`);
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
        throw new Error("El algoritmo eligió una página víctima que no está en RAM");
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
      throw new Error(`El proceso ${pid} ya terminó con kill, no puede pedir memoria`);
    }
    if (!Number.isInteger(size) || size < 1) {
      throw new Error(`Tamaño inválido para new: ${size}`);
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

  // Verifica que el proceso tenga el ptr en su tabla de simbolos o lanza un error
  function assert_owns_ptr(pid, ptr) {
    const owned_ptrs = symbol_table.get(pid);
    if (owned_ptrs === undefined || !owned_ptrs.has(ptr)) {
      throw new Error(`El proceso ${pid} no es dueño del ptr ${ptr}`);
    }
  }

  // Borra una pagina por completo: libera su marco si estaba en RAM y la quita del sistema
  function remove_page(page) {
    if (page.in_ram) {
      frames[page.frame] = null;
      page.in_ram = false;
      page.frame = null;
      algorithm.on_unload(page);
    }
    pages.delete(page.id);
  }

  // use: garantiza que todas las paginas del ptr esten en RAM, una por una
  function use_operation(pid, ptr, context) {
    // Paso 1: el ptr debe estar en la tabla de simbolos del proceso
    assert_owns_ptr(pid, ptr);

    // Paso 2: cada pagina es un hit (1s) si esta en RAM o un fallo (5s) si esta en disco
    for (const page of memory_map.get(ptr)) {
      if (page.in_ram) {
        charge_hit();
        algorithm.on_access(page, context);
      } else {
        charge_fault();
        load_page(page, context);
      }
    }
  }

  // delete: borra las paginas del ptr y lo elimina del mapa de memoria; no suma al reloj
  function delete_operation(pid, ptr) {
    // Paso 1: el ptr debe estar en la tabla de simbolos del proceso
    assert_owns_ptr(pid, ptr);

    // Paso 2: borrar cada pagina, en RAM o en disco
    for (const page of memory_map.get(ptr)) {
      remove_page(page);
    }

    // Paso 3: quitar el ptr del mapa, de la tabla de simbolos y de la fragmentacion
    memory_map.delete(ptr);
    symbol_table.get(pid).delete(ptr);
    stats.fragmentation_bytes -= fragmentation_by_ptr.get(ptr);
    fragmentation_by_ptr.delete(ptr);
  }

  // kill: borra todos los ptr del proceso y lo marca como terminado; no suma al reloj
  function kill_operation(pid) {
    // Paso 1: un proceso solo se puede matar una vez
    if (killed_pids.has(pid)) {
      throw new Error(`El proceso ${pid} ya terminó con kill`);
    }

    // Paso 2: copiar los ptr del proceso para poder borrarlos sin modificar el conjunto en el ciclo
    const owned_ptrs = symbol_table.get(pid);
    if (owned_ptrs !== undefined) {
      const ptr_list = [];
      for (const ptr of owned_ptrs) {
        ptr_list.push(ptr);
      }
      for (const ptr of ptr_list) {
        delete_operation(pid, ptr);
      }
      symbol_table.delete(pid);
    }

    // Paso 3: marcar el proceso como terminado
    killed_pids.add(pid);
    active_pids.delete(pid);
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
      // El ptr se valida antes de tocar el estado, para no dejar paginas a medias
      if (operation.ptr !== next_ptr) {
        throw new Error(`La operación espera el ptr ${operation.ptr} pero el siguiente ptr a asignar es ${next_ptr}`);
      }
      result = new_operation(operation.pid, operation.size, context);
    } else if (operation.type === "use") {
      use_operation(operation.pid, operation.ptr, context);
    } else if (operation.type === "delete") {
      delete_operation(operation.pid, operation.ptr);
    } else if (operation.type === "kill") {
      kill_operation(operation.pid);
    } else {
      throw new Error(`Tipo de operación desconocido: ${operation.type}`);
    }

    // Paso 3: contar la operacion ejecutada
    operations_executed++;
    return result;
  }

  return { execute, get_metrics, get_pages, get_frames };
}
