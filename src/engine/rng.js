// =============================================
// Generador pseudoaleatorio con semilla
// ---------------------------------------------

// Crea un generador mulberry32; la misma semilla produce siempre la misma secuencia
export function create_rng(seed) {
  // Paso 1: validar la semilla
  if (!Number.isInteger(seed)) {
    throw new Error(`Seed must be an integer, received: ${seed}`);
  }

  // Paso 2: normalizar la semilla a 32 bits
  let state = seed >>> 0;

  // Paso 3: devolver la funcion que entrega numeros en [0, 1)
  return function next_random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// Entrega un entero aleatorio en [min, max] usando el generador dado
export function random_int(next_random, min, max) {
  // Paso 1: validar el rango
  if (min > max) {
    throw new Error(`Invalid range: min ${min} is greater than max ${max}`);
  }

  // Paso 2: escalar el numero al rango
  return min + Math.floor(next_random() * (max - min + 1));
}
