// =============================================
// Imports
// ---------------------------------------------

import { generate_operations } from "./generator.js";
import { parse_operations } from "./parser.js";
import { VALID_ALGORITHMS, VALID_PROCESS_COUNTS, VALID_OPERATION_COUNTS } from "./types.js";

// =============================================
// Escenario de simulacion
// ---------------------------------------------

// Arma el escenario a partir de los datos de la pantalla de preparacion
export function build_scenario(options) {
  // Paso 1: validar el algoritmo elegido
  if (!VALID_ALGORITHMS.includes(options.algorithm_name)) {
    throw new Error(`El algoritmo debe ser uno de ${VALID_ALGORITHMS.join(", ")}, se recibió: ${options.algorithm_name}`);
  }

  // Paso 2: con archivo, las operaciones salen del archivo y se ignoran semilla, P y N
  if (options.file_text !== null && options.file_text !== undefined) {
    const operations = parse_operations(options.file_text);
    return {
      operations,
      algorithm_name: options.algorithm_name,
      source: "file",
      description: `Archivo de operaciones, ${operations.length} operaciones`,
    };
  }

  // Paso 3: sin archivo, validar semilla, P y N antes de generar
  if (!Number.isSafeInteger(options.seed)) {
    throw new Error(`La semilla debe ser un entero, se recibió: ${options.seed}`);
  }
  if (!VALID_PROCESS_COUNTS.includes(options.process_count)) {
    throw new Error(`La cantidad de procesos debe ser una de ${VALID_PROCESS_COUNTS.join(", ")}, se recibió: ${options.process_count}`);
  }
  if (!VALID_OPERATION_COUNTS.includes(options.operation_count)) {
    throw new Error(`La cantidad de operaciones debe ser una de ${VALID_OPERATION_COUNTS.join(", ")}, se recibió: ${options.operation_count}`);
  }

  // Paso 4: generar las operaciones con la semilla
  const operations = generate_operations(options.seed, options.process_count, options.operation_count);
  return {
    operations,
    algorithm_name: options.algorithm_name,
    source: "generated",
    description: `Semilla ${options.seed}, P=${options.process_count}, N=${options.operation_count}`,
  };
}
