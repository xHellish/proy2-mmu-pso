// =============================================
// Algoritmo LFU
// ---------------------------------------------

// Una pagina que entra a RAM empieza en 1, porque la carga cuenta como un acceso
function on_load(page, context) {
  page.freq = 1;
}

// Cada hit suma un acceso
function on_access(page, context) {
  page.freq++;
}

// Al bajar a disco la frecuencia se reinicia, para que una pagina fria no quede protegida
function on_unload(page) {
  page.freq = 0;
}

// Elige la pagina con menor freq; ante empate, la de menor loaded_at y luego la de menor id
function choose_victim(candidates, context) {
  // Paso 1: debe haber al menos un candidato
  if (candidates.length === 0) {
    throw new Error("LFU no tiene candidatos para desalojar");
  }

  // Paso 2: buscar la pagina menos usada, desempatando como FIFO
  let victim = candidates[0];
  for (const candidate of candidates) {
    if (candidate.freq < victim.freq) {
      victim = candidate;
    } else if (candidate.freq === victim.freq && candidate.loaded_at < victim.loaded_at) {
      victim = candidate;
    } else if (
      candidate.freq === victim.freq &&
      candidate.loaded_at === victim.loaded_at &&
      candidate.id < victim.id
    ) {
      victim = candidate;
    }
  }

  return victim;
}

// Crea el algoritmo LFU: desaloja la pagina con menor freq
export function create_lfu_algorithm() {
  return { name: "LFU", on_load, on_access, on_unload, choose_victim };
}
