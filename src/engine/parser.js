// =============================================
// Imports
// ---------------------------------------------

import { create_operation, OPERATION_TYPES } from "./types.js";

// =============================================
// Constantes del formato
// ---------------------------------------------

const OPERATION_REGEX = /(new|use|delete|kill)\s*\(([^)]*)\)/gi;
const COMMENT_REGEX = /\/\/[^\n\r]*/g;
const SEPARATOR_REGEX = /[\s,]/g;
const INTEGER_REGEX = /^\d+$/;

// =============================================
// Funciones auxiliares
// ---------------------------------------------

// Convierte un texto a entero no negativo o lanza un error con el contexto
function parse_integer(raw_value, description, operation_number) {
  // Paso 1: quitar espacios alrededor
  const trimmed = raw_value.trim();

  // Paso 2: aceptar solo digitos
  if (!INTEGER_REGEX.test(trimmed)) {
    throw new Error(
      `Operación ${operation_number}: ${description} debe ser un entero no negativo, se recibió "${trimmed}"`,
    );
  }

  return Number(trimmed);
}

// Verifica que un valor sea un entero positivo o lanza un error con el contexto
function assert_positive_integer(value, description, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label}: ${description} debe ser un entero positivo, se recibió ${value}`);
  }
}

// =============================================
// Parser del archivo de operaciones
// ---------------------------------------------

// Convierte el texto del archivo (Anexo 1) en una lista de operaciones validada
export function parse_operations(text) {
  // Paso 1: validar la entrada y limpiar BOM y comentarios //
  if (typeof text !== "string") {
    throw new Error("El texto de operaciones debe ser una cadena");
  }
  const cleaned = text.replace(/^﻿/, "").replace(COMMENT_REGEX, "");

  // Paso 2: rechazar cualquier texto que no sea una operacion, coma o espacio
  const leftover = cleaned.replace(OPERATION_REGEX, "").replace(SEPARATOR_REGEX, "");
  if (leftover.length > 0) {
    throw new Error(`Texto inesperado en el archivo de operaciones: "${leftover.slice(0, 30)}"`);
  }

  // Paso 3: recorrer las operaciones en orden de aparicion
  const operations = [];
  const owner_by_ptr = new Map();
  let next_ptr = 1;

  for (const match of cleaned.matchAll(OPERATION_REGEX)) {
    const operation_number = operations.length + 1;
    const type = match[1].toLowerCase();
    const args = match[2].split(",");

    // Paso 3.1: new(pid, size) recibe el siguiente ptr por orden de aparicion
    if (type === "new") {
      if (args.length !== 2) {
        throw new Error(
          `Operación ${operation_number}: new espera 2 argumentos (pid, size), recibió ${args.length}`,
        );
      }
      const pid = parse_integer(args[0], "el pid", operation_number);
      const size = parse_integer(args[1], "el tamaño", operation_number);
      operations.push(create_operation("new", pid, next_ptr, size));
      owner_by_ptr.set(next_ptr, pid);
      next_ptr++;
      continue;
    }

    // Paso 3.2: use(ptr), delete(ptr) y kill(pid) reciben un solo argumento
    if (args.length !== 1) {
      throw new Error(
        `Operación ${operation_number}: ${type} espera 1 argumento, recibió ${args.length}`,
      );
    }

    if (type === "kill") {
      const pid = parse_integer(args[0], "el pid", operation_number);
      operations.push(create_operation("kill", pid, null, null));
      continue;
    }

    // Paso 3.3: use/delete toman el pid dueno desde el ptr (null si el ptr no existe)
    const ptr = parse_integer(args[0], "el ptr", operation_number);
    let owner_pid = owner_by_ptr.get(ptr);
    if (owner_pid === undefined) {
      owner_pid = null;
    }
    operations.push(create_operation(type, owner_pid, ptr, null));
  }

  // Paso 4: un archivo sin operaciones no es valido
  if (operations.length === 0) {
    throw new Error("El archivo de operaciones no tiene operaciones");
  }

  // Paso 5: validar las reglas del enunciado antes de devolver
  validate_operations(operations);
  return operations;
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

    // Paso 2.1: new debe ser de un proceso vivo y traer el ptr secuencial
    if (operation.type === "new") {
      assert_positive_integer(operation.pid, "el pid", label);
      assert_positive_integer(operation.size, "el tamaño", label);
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
      assert_positive_integer(operation.pid, "el pid", label);
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
