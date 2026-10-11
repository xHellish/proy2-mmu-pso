// =============================================
// Imports
// ---------------------------------------------

import { create_mmu } from "./mmu.js";
import { create_algorithm, create_opt_algorithm } from "./algorithms/index.js";
import { validate_operations, serialize_operation } from "./parser.js";
import { VALID_ALGORITHMS } from "./types.js";

// =============================================
// Funciones auxiliares
// ---------------------------------------------

// Toma una foto del estado de una MMU para que la interfaz la dibuje
function take_snapshot(mmu) {
  return {
    metrics: mmu.get_metrics(),
    pages: mmu.get_pages(),
    frames: mmu.get_frames(),
  };
}

// =============================================
// Simulador coordinado
// ---------------------------------------------

// Crea el simulador que corre OPT y el algoritmo elegido sobre las mismas operaciones
export function create_simulator(algorithm_name, operations) {
  // Paso 1: validar el algoritmo y las operaciones
  if (!VALID_ALGORITHMS.includes(algorithm_name)) {
    throw new Error(`Algoritmo desconocido: ${algorithm_name}`);
  }
  validate_operations(operations);

  // Paso 2: dos MMU independientes, cada una con su propio reloj
  const opt_mmu = create_mmu(create_opt_algorithm(operations));
  const selected_mmu = create_mmu(create_algorithm(algorithm_name));
  let next_index = 0;

  // Avanza una operacion en ambas MMU; devuelve false si ya no quedan operaciones
  function step() {
    // Paso 1: no hay nada que ejecutar al terminar
    if (next_index >= operations.length) {
      return false;
    }

    // Paso 2: la misma operacion en las dos MMU, en el mismo orden desde el indice 0
    const operation = operations[next_index];
    opt_mmu.execute(operation);
    selected_mmu.execute(operation);
    next_index++;
    return true;
  }

  // Avanza hasta count operaciones; devuelve cuantas se ejecutaron
  function step_many(count) {
    let executed = 0;
    while (executed < count && step()) {
      executed++;
    }
    return executed;
  }

  // Indica si ya se ejecutaron todas las operaciones
  function is_finished() {
    return next_index >= operations.length;
  }

  // Devuelve el estado completo de ambas MMU para dibujarlo
  function get_snapshot() {
    // Paso 1: la ultima operacion ejecutada, para mostrarla en pantalla
    let last_operation = null;
    if (next_index > 0) {
      last_operation = serialize_operation(operations[next_index - 1]);
    }

    // Paso 2: armar la foto de ambas MMU
    return {
      algorithm_name,
      operation_index: next_index,
      total_operations: operations.length,
      finished: is_finished(),
      last_operation,
      opt: take_snapshot(opt_mmu),
      selected: take_snapshot(selected_mmu),
    };
  }

  return { step, step_many, is_finished, get_snapshot };
}
