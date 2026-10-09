// =============================================
// Constantes del sistema simulado
// ---------------------------------------------

export const PAGE_SIZE_BYTES = 4096;
export const RAM_PAGES = 100;
export const HIT_COST_SECONDS = 1;
export const FAULT_COST_SECONDS = 5;
export const THRASHING_ALERT_RATIO = 0.5;

// =============================================
// Valores permitidos
// ---------------------------------------------

export const VALID_ALGORITHMS = ["FIFO", "SC", "LRU", "LFU"];
export const VALID_PROCESS_COUNTS = [10, 50, 100];
export const VALID_OPERATION_COUNTS = [500, 1000, 5000];
export const OPERATION_TYPES = ["new", "use", "delete", "kill"];

// =============================================
// Fabricas de datos
// ---------------------------------------------

// Crea una operacion; para new el valor es el size, para use/delete el ptr y para kill el pid
export function create_operation(type, pid, value) {
  // Paso 1: validar el tipo de operacion
  if (!OPERATION_TYPES.includes(type)) {
    throw new Error(`Invalid operation type: ${type}`);
  }

  // Paso 2: armar la operacion
  return { type, pid, value };
}

// Crea una pagina nueva con los datos que necesitan todos los algoritmos
export function create_page(id, pid, ptr) {
  return {
    id,
    pid,
    ptr,
    in_ram: false,
    frame: null,
    disk_addr: null,
    loaded_at: 0,
    ref_bit: 0,
    last_use: 0,
    freq: 0,
  };
}
