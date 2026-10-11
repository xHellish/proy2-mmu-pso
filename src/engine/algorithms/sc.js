// =============================================
// Algoritmo Second Chance
// ---------------------------------------------

// Crea el algoritmo SC: FIFO con bit de referencia (columna MARK)
export function create_sc_algorithm() {
  // La cola es el orden FIFO; loaded_at no se toca porque la interfaz lo muestra como LOADED-T
  const queue = [];

  // Una pagina que entra a RAM va al final de la cola y su carga cuenta como acceso
  function on_load(page, context) {
    page.ref_bit = 1;
    queue.push(page);
  }

  // Cada acceso activa el bit de referencia
  function on_access(page, context) {
    page.ref_bit = 1;
  }

  // Una pagina que sale de RAM (desalojo, delete o kill) deja la cola y apaga su bit
  function on_unload(page) {
    const queue_index = queue.indexOf(page);
    if (queue_index === -1) {
      throw new Error(`SC no puede descargar la página ${page.id}: no está en la cola`);
    }
    queue.splice(queue_index, 1);
    page.ref_bit = 0;
  }

  // Recorre la cola: si la pagina tiene bit 1 lo apaga y la manda al final; si tiene 0, es la victima
  function choose_victim(candidates, context) {
    // Paso 1: la cola debe coincidir con las paginas en RAM
    if (candidates.length === 0) {
      throw new Error("SC no tiene candidatos para desalojar");
    }
    if (queue.length !== candidates.length) {
      throw new Error(
        `La cola de SC está desincronizada: ${queue.length} páginas en cola y ${candidates.length} candidatas`,
      );
    }

    // Paso 2: dar segundas oportunidades; tras una vuelta completa todos los bits son 0
    while (true) {
      const page = queue[0];
      if (page.ref_bit === 0) {
        return page;
      }
      page.ref_bit = 0;
      queue.shift();
      queue.push(page);
    }
  }

  return { name: "SC", on_load, on_access, on_unload, choose_victim };
}
