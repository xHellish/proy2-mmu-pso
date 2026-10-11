// =============================================
// Algoritmo OPT
// ---------------------------------------------

// Crea el algoritmo OPT: desaloja la pagina cuyo ptr se vuelve a usar mas tarde
export function create_opt_algorithm(operations) {
  // Paso 1: validar la lista completa de operaciones, que OPT necesita para ver el futuro
  if (!Array.isArray(operations)) {
    throw new Error("OPT requiere la lista completa de operaciones");
  }

  // Paso 2: precalcular, por cada ptr, los indices de operacion donde aparece un use
  const uses_by_ptr = new Map();
  for (const [operation_index, operation] of operations.entries()) {
    if (operation.type !== "use") {
      continue;
    }
    if (!uses_by_ptr.has(operation.ptr)) {
      uses_by_ptr.set(operation.ptr, []);
    }
    uses_by_ptr.get(operation.ptr).push(operation_index);
  }

  // OPT no guarda estado por pagina: decide solo con el futuro
  function on_load(page, context) {
    // Sin accion
  }

  // Un acceso no cambia nada para OPT
  function on_access(page, context) {
    // Sin accion
  }

  // OPT no guarda estructuras que limpiar al sacar una pagina de RAM
  function on_unload(page) {
    // Sin accion
  }

  // Devuelve el indice del siguiente use del ptr despues de la operacion en curso, o Infinity
  function get_next_use(ptr, current_index) {
    // Paso 1: sin usos futuros (nunca se usa, o se borra antes de usarse) la distancia es infinita
    const uses = uses_by_ptr.get(ptr);
    if (uses === undefined) {
      return Infinity;
    }

    // Paso 2: busqueda binaria del primer use con indice mayor a la operacion en curso
    let low = 0;
    let high = uses.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (uses[middle] > current_index) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }

    // Paso 3: si no queda ninguno, la distancia es infinita
    if (low === uses.length) {
      return Infinity;
    }
    return uses[low];
  }

  // Elige la pagina cuyo ptr se usa mas tarde; ante empate, la de menor loaded_at y luego menor id
  function choose_victim(candidates, context) {
    // Paso 1: validar candidatos y contexto
    if (candidates.length === 0) {
      throw new Error("OPT no tiene candidatos para desalojar");
    }
    if (context === undefined || !Number.isInteger(context.operation_index)) {
      throw new Error("OPT necesita el operation_index actual en el contexto");
    }

    // Paso 2: buscar la pagina con el siguiente uso mas lejano
    let victim = candidates[0];
    let victim_next_use = get_next_use(victim.ptr, context.operation_index);
    for (const candidate of candidates) {
      const candidate_next_use = get_next_use(candidate.ptr, context.operation_index);
      let is_better = false;
      if (candidate_next_use > victim_next_use) {
        is_better = true;
      } else if (candidate_next_use === victim_next_use) {
        if (candidate.loaded_at < victim.loaded_at) {
          is_better = true;
        } else if (candidate.loaded_at === victim.loaded_at && candidate.id < victim.id) {
          is_better = true;
        }
      }
      if (is_better) {
        victim = candidate;
        victim_next_use = candidate_next_use;
      }
    }

    return victim;
  }

  return { name: "OPT", on_load, on_access, on_unload, choose_victim };
}
