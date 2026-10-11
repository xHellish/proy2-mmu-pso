// =============================================
// Algoritmo FIFO
// ---------------------------------------------

// FIFO no lleva estado propio: usa loaded_at, que asigna la MMU al cargar la pagina
function on_load(page, context) {
  // Sin accion
}

// Un acceso no cambia el orden de llegada en FIFO
function on_access(page, context) {
  // Sin accion
}

// FIFO no guarda estructuras que limpiar al sacar una pagina de RAM
function on_unload(page) {
  // Sin accion
}

// Elige la pagina con menor loaded_at; ante empate, la de menor id
function choose_victim(candidates, context) {
  // Paso 1: debe haber al menos un candidato
  if (candidates.length === 0) {
    throw new Error("FIFO has no candidates to evict");
  }

  // Paso 2: buscar la pagina que lleva mas tiempo en RAM
  let victim = candidates[0];
  for (const candidate of candidates) {
    if (candidate.loaded_at < victim.loaded_at) {
      victim = candidate;
    } else if (candidate.loaded_at === victim.loaded_at && candidate.id < victim.id) {
      victim = candidate;
    }
  }

  return victim;
}

// Crea el algoritmo FIFO: desaloja la pagina con menor loaded_at
export function create_fifo_algorithm() {
  return { name: "FIFO", on_load, on_access, on_unload, choose_victim };
}
