// =============================================
// Imports
// ---------------------------------------------

import { create_rng, random_int } from "./rng.js";
import { create_operation, PAGE_SIZE_BYTES } from "./types.js";
import { validate_operations } from "./parser.js";

// =============================================
// Parametros del generador
// ---------------------------------------------

// Probabilidad de cada operacion, en %, cuando el proceso ya tiene ptr vivos (delete es el resto)
const NEW_PERCENT = 15;
const USE_PERCENT = 70;

// Probabilidad de cada rango de tamano, en % (los grandes son el resto)
const SMALL_SIZE_PERCENT = 80;
const MEDIUM_SIZE_PERCENT = 15;

// Tope de paginas de cada rango; ningun bloque generado pasa de 100 paginas
const SMALL_MAX_PAGES = 1;
const MEDIUM_MAX_PAGES = 10;
const LARGE_MAX_PAGES = 50;

// =============================================
// Funciones auxiliares
// ---------------------------------------------

// Verifica que un parametro sea un entero positivo o lanza un error
function assert_positive_integer(value, description) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${description} debe ser un entero positivo, se recibió ${value}`);
  }
}

// Elige un tamano en bytes: la mayoria pequenos, algunos de varias paginas
function random_size(next_random) {
  const roll = random_int(next_random, 1, 100);
  if (roll <= SMALL_SIZE_PERCENT) {
    return random_int(next_random, 1, SMALL_MAX_PAGES * PAGE_SIZE_BYTES);
  }
  if (roll <= SMALL_SIZE_PERCENT + MEDIUM_SIZE_PERCENT) {
    return random_int(
      next_random,
      SMALL_MAX_PAGES * PAGE_SIZE_BYTES + 1,
      MEDIUM_MAX_PAGES * PAGE_SIZE_BYTES,
    );
  }
  return random_int(
    next_random,
    MEDIUM_MAX_PAGES * PAGE_SIZE_BYTES + 1,
    LARGE_MAX_PAGES * PAGE_SIZE_BYTES,
  );
}

// Elige el tipo de operacion; sin ptr vivos solo se puede hacer new
function random_operation_type(next_random, live_ptr_count) {
  if (live_ptr_count === 0) {
    return "new";
  }
  const roll = random_int(next_random, 1, 100);
  if (roll <= NEW_PERCENT) {
    return "new";
  }
  if (roll <= NEW_PERCENT + USE_PERCENT) {
    return "use";
  }
  return "delete";
}

// Reparte las operaciones de trabajo entre los procesos: cada uno recibe al menos 1
function split_quotas(next_random, process_count, work_budget) {
  // Paso 1: una operacion garantizada por proceso
  const quotas = new Map();
  for (let pid = 1; pid <= process_count; pid++) {
    quotas.set(pid, 1);
  }

  // Paso 2: el resto se reparte al azar, una operacion a la vez
  for (let index = process_count; index < work_budget; index++) {
    const pid = random_int(next_random, 1, process_count);
    quotas.set(pid, quotas.get(pid) + 1);
  }

  return quotas;
}

// =============================================
// Generador de operaciones
// ---------------------------------------------

// Genera exactamente N operaciones validas para P procesos; la misma semilla da la misma lista
export function generate_operations(seed, process_count, operation_count) {
  // Paso 1: validar parametros; cada proceso necesita al menos una operacion y su kill
  if (!Number.isInteger(seed)) {
    throw new Error(`La semilla debe ser un entero, se recibió: ${seed}`);
  }
  assert_positive_integer(process_count, "La cantidad de procesos");
  assert_positive_integer(operation_count, "La cantidad de operaciones");
  if (operation_count < 2 * process_count) {
    throw new Error(
      `${operation_count} operaciones son muy pocas para ${process_count} procesos: se necesitan al menos ${2 * process_count}`,
    );
  }

  // Paso 2: reservar P operaciones para los kill y repartir el resto entre los procesos
  const next_random = create_rng(seed);
  const quotas = split_quotas(next_random, process_count, operation_count - process_count);

  // Paso 3: estado de la generacion
  const operations = [];
  const alive_pids = [];
  const live_ptrs_by_pid = new Map();
  for (let pid = 1; pid <= process_count; pid++) {
    alive_pids.push(pid);
    live_ptrs_by_pid.set(pid, []);
  }
  let next_ptr = 1;

  // Paso 4: en cada paso, un proceso vivo al azar hace una operacion valida para el
  while (alive_pids.length > 0) {
    const position = random_int(next_random, 0, alive_pids.length - 1);
    const pid = alive_pids[position];
    const live_ptrs = live_ptrs_by_pid.get(pid);
    const type = random_operation_type(next_random, live_ptrs.length);

    if (type === "new") {
      operations.push(create_operation("new", pid, next_ptr, random_size(next_random)));
      live_ptrs.push(next_ptr);
      next_ptr++;
    } else if (type === "use") {
      const ptr = live_ptrs[random_int(next_random, 0, live_ptrs.length - 1)];
      operations.push(create_operation("use", pid, ptr, null));
    } else {
      const ptr_position = random_int(next_random, 0, live_ptrs.length - 1);
      operations.push(create_operation("delete", pid, live_ptrs[ptr_position], null));
      live_ptrs.splice(ptr_position, 1);
    }

    // Paso 4.1: al agotar su cuota, el proceso termina con su kill
    const remaining = quotas.get(pid) - 1;
    quotas.set(pid, remaining);
    if (remaining === 0) {
      operations.push(create_operation("kill", pid, null, null));
      alive_pids.splice(position, 1);
    }
  }

  // Paso 5: comprobar que la lista cumple las reglas y tiene exactamente N operaciones
  if (operations.length !== operation_count) {
    throw new Error(
      `El generador produjo ${operations.length} operaciones en lugar de ${operation_count}`,
    );
  }
  validate_operations(operations);
  return operations;
}
