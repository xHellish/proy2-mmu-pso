// =============================================
// Algoritmo OPT
// ---------------------------------------------

// Crea el algoritmo OPT: desaloja la pagina que se vuelve a acceder mas tarde
export function create_opt_algorithm(operations) {
  // Paso 1: validar la lista completa de operaciones, que OPT necesita para ver el futuro
  if (!Array.isArray(operations)) {
    throw new Error("OPT requiere la lista completa de operaciones");
  }

  // Paso 2: precalcular, por cada ptr, los indices de operacion donde aparece un use que se ejecuta
  const uses_by_ptr = new Map();
  for (const [operation_index, operation] of operations.entries()) {
    if (operation.type !== "use" || operation.ignored_reason !== undefined) {
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

  // Devuelve cuando se vuelve a acceder la pagina: la operacion y su posicion dentro del ptr
  function get_next_access(candidate, context) {
    // Paso 1: en un use, las paginas del mismo ptr que van despues de la actual se acceden en esta misma operacion
    const current = operations[context.operation_index];
    if (
      current !== undefined &&
      current.type === "use" &&
      current.ptr === candidate.ptr &&
      Number.isInteger(context.page_index) &&
      candidate.index > context.page_index
    ) {
      return { operation: context.operation_index, index: candidate.index };
    }

    // Paso 2: en cualquier otro caso, en el siguiente use del ptr, donde las paginas se acceden en orden
    return { operation: get_next_use(candidate.ptr, context.operation_index), index: candidate.index };
  }

  // Indica si el primer acceso esta mas lejos en el futuro que el segundo; nunca es mas lejos si ambos son infinitos
  function is_farther(first, second) {
    if (first.operation !== second.operation) {
      return first.operation > second.operation;
    }
    if (first.operation === Infinity) {
      return false;
    }
    return first.index > second.index;
  }

  // Indica si dos accesos son del mismo momento (ambos infinitos o misma operacion y posicion)
  function is_same_distance(first, second) {
    if (first.operation !== second.operation) {
      return false;
    }
    if (first.operation === Infinity) {
      return true;
    }
    return first.index === second.index;
  }

  // Elige la pagina que se accede mas tarde; ante empate, la de menor loaded_at y luego menor id
  function choose_victim(candidates, context) {
    // Paso 1: validar candidatos y contexto
    if (candidates.length === 0) {
      throw new Error("OPT no tiene candidatos para desalojar");
    }
    if (context === undefined || !Number.isInteger(context.operation_index)) {
      throw new Error("OPT necesita el operation_index actual en el contexto");
    }

    // Paso 2: buscar la pagina con el siguiente acceso mas lejano
    let victim = candidates[0];
    let victim_access = get_next_access(victim, context);
    for (const candidate of candidates) {
      const candidate_access = get_next_access(candidate, context);
      let is_better = false;
      if (is_farther(candidate_access, victim_access)) {
        is_better = true;
      } else if (is_same_distance(candidate_access, victim_access)) {
        if (candidate.loaded_at < victim.loaded_at) {
          is_better = true;
        } else if (candidate.loaded_at === victim.loaded_at && candidate.id < victim.id) {
          is_better = true;
        }
      }
      if (is_better) {
        victim = candidate;
        victim_access = candidate_access;
      }
    }

    return victim;
  }

  return { name: "OPT", on_load, on_access, on_unload, choose_victim };
}
