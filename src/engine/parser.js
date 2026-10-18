// =============================================
// Imports
// ---------------------------------------------

import { create_operation, OPERATION_TYPES, PAGE_SIZE_BYTES, MAX_PAGES_PER_PTR } from "./types.js";

// =============================================
// Constantes del formato
// ---------------------------------------------

const OPERATION_REGEX = /(new|use|delete|kill)\s*\(([^)]*)\)/gi;
const COMMENT_REGEX = /\/\/.*/g;
const SEPARATOR_REGEX = /[\s,;]/g;
const LINE_BREAK_REGEX = /\r\n|\r|\n/;
const INTEGER_REGEX = /^\d+$/;
const MAX_QUOTED_LENGTH = 40;

// =============================================
// Funciones auxiliares
// ---------------------------------------------

// Convierte un texto a entero no negativo o lanza un error con el contexto
function parse_integer(raw_value, description) {
  // Paso 1: quitar espacios alrededor
  const trimmed = raw_value.trim();

  // Paso 2: aceptar solo digitos
  if (!INTEGER_REGEX.test(trimmed)) {
    throw new Error(`${description} debe ser un entero no negativo, se recibió "${trimmed}"`);
  }

  return Number(trimmed);
}

// Verifica que un valor sea un entero no negativo o lanza un error con el contexto
function assert_non_negative_integer(value, description, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label}: ${description} debe ser un entero no negativo, se recibió ${value}`);
  }
}

// Devuelve el motivo por el que un tamano no cabe en un ptr, o null si cabe
function get_size_problem(size) {
  const page_count = Math.ceil(size / PAGE_SIZE_BYTES);
  if (page_count > MAX_PAGES_PER_PTR) {
    return `el tamaño ${size} necesita ${page_count} páginas, el máximo permitido es ${MAX_PAGES_PER_PTR}`;
  }
  return null;
}

// Verifica que el tamano no necesite mas paginas que el maximo permitido por ptr
function assert_size_fits(size, label) {
  const problem = get_size_problem(size);
  if (problem !== null) {
    throw new Error(`${label}: ${problem}`);
  }
}

// Recorta un texto largo para mostrarlo en un aviso
function shorten(text) {
  if (text.length <= MAX_QUOTED_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_QUOTED_LENGTH)}...`;
}

// Convierte una operacion reconocida por la regex en sus valores, o lanza un error de formato
function parse_match(match) {
  // Paso 1: tipo y argumentos separados por coma
  const type = match[1].toLowerCase();
  const args = match[2].split(",");

  // Paso 2: new(pid, size) recibe dos argumentos
  if (type === "new") {
    if (args.length !== 2) {
      throw new Error(`new espera 2 argumentos (pid, size), recibió ${args.length}`);
    }
    return {
      type,
      pid: parse_integer(args[0], "el pid"),
      size: parse_integer(args[1], "el tamaño"),
      ptr: null,
    };
  }

  // Paso 3: use(ptr), delete(ptr) y kill(pid) reciben un solo argumento
  if (args.length !== 1) {
    throw new Error(`${type} espera 1 argumento, recibió ${args.length}`);
  }
  if (type === "kill") {
    return { type, pid: parse_integer(args[0], "el pid"), size: null, ptr: null };
  }
  return { type, pid: null, size: null, ptr: parse_integer(args[0], "el ptr") };
}

// Crea el estado de las reglas del enunciado que se acumula al leer el archivo
function create_rules_state() {
  return {
    next_ptr: 1,
    owner_by_ptr: new Map(),
    deleted_ptrs: new Set(),
    killed_pids: new Set(),
    ignored_new_ptrs: new Set(),
  };
}

// Devuelve el motivo por el que un use o delete no se puede ejecutar, o null si es valido
function get_ptr_problem(ptr, state) {
  if (state.ignored_new_ptrs.has(ptr)) {
    return `el ptr ${ptr} no existe porque su new fue ignorado`;
  }
  if (!state.owner_by_ptr.has(ptr)) {
    return `el ptr ${ptr} nunca fue creado`;
  }
  const owner_pid = state.owner_by_ptr.get(ptr);
  if (state.killed_pids.has(owner_pid)) {
    return `el ptr ${ptr} pertenece al proceso ${owner_pid}, que ya terminó con kill`;
  }
  if (state.deleted_ptrs.has(ptr)) {
    return `el ptr ${ptr} ya fue borrado`;
  }
  return null;
}

// Aplica las reglas del enunciado a una operacion leida; si no se puede ejecutar la marca como ignorada
function apply_rules(parsed, state) {
  // Paso 1: new consume siempre el siguiente ptr, para respetar la numeracion por orden de aparicion
  if (parsed.type === "new") {
    const ptr = state.next_ptr;
    state.next_ptr++;
    const operation = create_operation("new", parsed.pid, ptr, parsed.size);
    let reason = get_size_problem(parsed.size);
    if (state.killed_pids.has(parsed.pid)) {
      reason = `el proceso ${parsed.pid} ya terminó con kill`;
    }
    if (reason !== null) {
      operation.ignored_reason = reason;
      state.ignored_new_ptrs.add(ptr);
      return operation;
    }
    state.owner_by_ptr.set(ptr, parsed.pid);
    return operation;
  }

  // Paso 2: kill solo se puede usar una vez por proceso
  if (parsed.type === "kill") {
    const operation = create_operation("kill", parsed.pid, null, null);
    if (state.killed_pids.has(parsed.pid)) {
      operation.ignored_reason = `el proceso ${parsed.pid} ya terminó con kill`;
      return operation;
    }
    state.killed_pids.add(parsed.pid);
    return operation;
  }

  // Paso 3: use y delete toman el pid dueno desde el ptr (null si no existe) y solo aplican a un ptr vivo
  let owner_pid = state.owner_by_ptr.get(parsed.ptr);
  if (owner_pid === undefined) {
    owner_pid = null;
  }
  const operation = create_operation(parsed.type, owner_pid, parsed.ptr, null);
  const reason = get_ptr_problem(parsed.ptr, state);
  if (reason !== null) {
    operation.ignored_reason = reason;
    return operation;
  }
  if (parsed.type === "delete") {
    state.deleted_ptrs.add(parsed.ptr);
  }
  return operation;
}

// =============================================
// Lectura del archivo de operaciones
// ---------------------------------------------

// Lee el archivo (Anexo 1) sin detenerse en errores: salta lo ilegible y marca lo ilogico como ignorado
export function read_operations_file(text) {
  // Paso 1: validar la entrada y quitar el BOM
  if (typeof text !== "string") {
    throw new Error("El texto de operaciones debe ser una cadena");
  }
  const lines = text.replace(/^﻿/, "").split(LINE_BREAK_REGEX);

  const operations = [];
  const warnings = [];
  const state = create_rules_state();

  // Paso 2: recorrer el archivo linea por linea
  for (const [line_index, raw_line] of lines.entries()) {
    const line_number = line_index + 1;
    const line = raw_line.replace(COMMENT_REGEX, "");

    // Paso 2.1: el texto que no es una operacion ni un separador se salta con aviso
    const leftover = line.replace(OPERATION_REGEX, "").replace(SEPARATOR_REGEX, "");
    if (leftover.length > 0) {
      warnings.push(`Línea ${line_number}: texto no reconocido "${shorten(leftover)}", se ignoró`);
    }

    // Paso 2.2: cada operacion de la linea; si su formato es invalido se salta con aviso
    for (const match of line.matchAll(OPERATION_REGEX)) {
      let parsed = null;
      try {
        parsed = parse_match(match);
      } catch (error) {
        warnings.push(`Línea ${line_number} (${shorten(match[0].trim())}): ${error.message}, se ignoró`);
        continue;
      }

      // Paso 2.3: una operacion ilogica queda en la secuencia, marcada como ignorada
      const operation = apply_rules(parsed, state);
      operations.push(operation);
      if (operation.ignored_reason !== undefined) {
        warnings.push(
          `Operación ${operations.length} (${serialize_operation(operation)}), línea ${line_number}: ${operation.ignored_reason}, se ignorará`,
        );
      }
    }
  }

  // Paso 3: un archivo sin ninguna operacion legible no es valido
  if (operations.length === 0) {
    let message = "El archivo de operaciones no tiene operaciones";
    if (warnings.length > 0) {
      message += `. ${warnings[0]}`;
    }
    throw new Error(message);
  }

  return { operations, warnings };
}

// Lee el archivo en modo estricto: cualquier aviso es un error (lo usan las pruebas y los ejemplos)
export function parse_operations(text) {
  const result = read_operations_file(text);
  if (result.warnings.length > 0) {
    throw new Error(result.warnings[0]);
  }
  return result.operations;
}

// =============================================
// Validacion
// ---------------------------------------------

// Valida que la lista de operaciones respete las reglas del enunciado
export function validate_operations(operations) {
  // Paso 1: la lista debe tener al menos una operacion
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("La lista de operaciones debe tener al menos una operación");
  }

  const owner_by_ptr = new Map();
  const deleted_ptrs = new Set();
  const killed_pids = new Set();
  let expected_ptr = 1;

  // Paso 2: revisar cada operacion contra el estado acumulado
  for (const [index, operation] of operations.entries()) {
    const label = `Operación ${index + 1} (${serialize_operation(operation)})`;

    // Paso 2.0: una operacion ignorada no se ejecuta, pero un new ignorado igual consume su ptr
    if (operation.ignored_reason !== undefined) {
      if (typeof operation.ignored_reason !== "string" || operation.ignored_reason.length === 0) {
        throw new Error(`${label}: el motivo para ignorarla debe ser un texto no vacío`);
      }
      if (operation.type === "new") {
        if (operation.ptr !== expected_ptr) {
          throw new Error(`${label}: se esperaba el ptr ${expected_ptr}, se recibió ${operation.ptr}`);
        }
        expected_ptr++;
      }
      continue;
    }

    // Paso 2.1: new debe ser de un proceso vivo y traer el ptr secuencial
    if (operation.type === "new") {
      assert_non_negative_integer(operation.pid, "el pid", label);
      assert_non_negative_integer(operation.size, "el tamaño", label);
      assert_size_fits(operation.size, label);
      if (killed_pids.has(operation.pid)) {
        throw new Error(`${label}: el proceso ${operation.pid} ya terminó con kill`);
      }
      if (operation.ptr !== expected_ptr) {
        throw new Error(`${label}: se esperaba el ptr ${expected_ptr}, se recibió ${operation.ptr}`);
      }
      owner_by_ptr.set(operation.ptr, operation.pid);
      expected_ptr++;
      continue;
    }

    // Paso 2.2: kill solo se puede usar una vez por proceso
    if (operation.type === "kill") {
      assert_non_negative_integer(operation.pid, "el pid", label);
      if (killed_pids.has(operation.pid)) {
        throw new Error(`${label}: el proceso ${operation.pid} ya terminó con kill`);
      }
      killed_pids.add(operation.pid);
      continue;
    }

    // Paso 2.3: use y delete solo aplican a un ptr existente y vivo
    if (!owner_by_ptr.has(operation.ptr)) {
      throw new Error(`${label}: el ptr ${operation.ptr} nunca fue creado`);
    }
    const owner_pid = owner_by_ptr.get(operation.ptr);
    if (killed_pids.has(owner_pid)) {
      throw new Error(
        `${label}: el ptr ${operation.ptr} pertenece al proceso ${owner_pid}, que ya terminó con kill`,
      );
    }
    if (deleted_ptrs.has(operation.ptr)) {
      throw new Error(`${label}: el ptr ${operation.ptr} ya fue borrado`);
    }
    if (operation.pid !== owner_pid) {
      throw new Error(
        `${label}: el ptr ${operation.ptr} pertenece al proceso ${owner_pid}, no al ${operation.pid}`,
      );
    }
    if (operation.type === "delete") {
      deleted_ptrs.add(operation.ptr);
    }
  }
}

// =============================================
// Serializacion
// ---------------------------------------------

// Convierte una operacion a su texto del Anexo 1, por ejemplo new(1,500)
export function serialize_operation(operation) {
  // Paso 1: validar el tipo
  if (!OPERATION_TYPES.includes(operation.type)) {
    throw new Error(`Tipo de operación inválido: ${operation.type}`);
  }

  // Paso 2: armar el texto segun el tipo
  if (operation.type === "new") {
    return `new(${operation.pid},${operation.size})`;
  }
  if (operation.type === "kill") {
    return `kill(${operation.pid})`;
  }
  return `${operation.type}(${operation.ptr})`;
}

// Convierte una lista de operaciones al formato del Anexo 1: una por linea
export function serialize_operations(operations) {
  // Paso 1: serializar cada operacion
  const lines = [];
  for (const operation of operations) {
    lines.push(serialize_operation(operation));
  }

  // Paso 2: unir con saltos de linea y cerrar con uno final
  return lines.join("\n") + "\n";
}
