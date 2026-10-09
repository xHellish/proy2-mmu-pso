// =============================================
// Imports
// ---------------------------------------------

import { create_fifo_algorithm } from "./fifo.js";
import { create_sc_algorithm } from "./sc.js";
import { create_lru_algorithm } from "./lru.js";
import { create_lfu_algorithm } from "./lfu.js";

export { create_opt_algorithm } from "./opt.js";

// =============================================
// Registro de algoritmos
// ---------------------------------------------

// Interfaz comun: on_load(page), on_access(page), choose_victim(candidates, context)
export const ALGORITHM_FACTORIES = {
  FIFO: create_fifo_algorithm,
  SC: create_sc_algorithm,
  LRU: create_lru_algorithm,
  LFU: create_lfu_algorithm,
};

// =============================================
// Funciones
// ---------------------------------------------

// Crea el algoritmo del usuario a partir de su nombre
export function create_algorithm(name) {
  // Paso 1: buscar la fabrica del algoritmo
  const factory = ALGORITHM_FACTORIES[name];
  if (factory === undefined) {
    throw new Error(`Unknown algorithm: ${name}`);
  }

  // Paso 2: crear la instancia
  return factory();
}
