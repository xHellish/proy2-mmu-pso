// =============================================
// Algoritmo LRU
// ---------------------------------------------

// Crea el algoritmo LRU: desaloja la pagina con menor last_use (contador de accesos)
export function create_lru_algorithm() {
  // Contador de accesos propio: el orden de uso no depende de los costos de tiempo del modelo
  let access_counter = 0;

  // Marca la pagina como la mas recientemente usada
  function touch_page(page) {
    access_counter++;
    page.last_use = access_counter;
  }

  // Cargar una pagina cuenta como un acceso
  function on_load(page, context) {
    touch_page(page);
  }

  // Cada hit actualiza el ultimo uso
  function on_access(page, context) {
    touch_page(page);
  }

  // LRU no guarda estructuras que limpiar al sacar una pagina de RAM
  function on_unload(page) {
    // Sin accion
  }

  // Elige la pagina con menor last_use; ante empate (no deberia ocurrir), la de menor id
  function choose_victim(candidates, context) {
    // Paso 1: debe haber al menos un candidato
    if (candidates.length === 0) {
      throw new Error("LRU no tiene candidatos para desalojar");
    }

    // Paso 2: buscar la pagina usada hace mas tiempo
    let victim = candidates[0];
    for (const candidate of candidates) {
      if (candidate.last_use < victim.last_use) {
        victim = candidate;
      } else if (candidate.last_use === victim.last_use && candidate.id < victim.id) {
        victim = candidate;
      }
    }

    return victim;
  }

  return { name: "LRU", on_load, on_access, on_unload, choose_victim };
}
