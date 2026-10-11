// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parse_operations,
  validate_operations,
  serialize_operations,
} from "../src/engine/parser.js";
import { create_operation } from "../src/engine/types.js";

// =============================================
// Datos de prueba
// ---------------------------------------------

const ANEXO_1_TEXT = readFileSync(new URL("../examples/anexo1.txt", import.meta.url), "utf8");

// =============================================
// Parser: Anexo 1
// ---------------------------------------------

test("parses the Annex 1 example", () => {
  const operations = parse_operations(ANEXO_1_TEXT);

  assert.equal(operations.length, 16);
  assert.deepEqual(operations[0], create_operation("new", 1, 1, 500));
  assert.deepEqual(operations[2], create_operation("new", 1, 2, 1000));
  assert.deepEqual(operations[5], create_operation("new", 2, 3, 500));
  assert.deepEqual(operations[8], create_operation("new", 2, 4, 50));
});

test("use and delete take the owner pid from the ptr", () => {
  const operations = parse_operations(ANEXO_1_TEXT);

  assert.deepEqual(operations[1], create_operation("use", 1, 1, null));
  assert.deepEqual(operations[6], create_operation("use", 2, 3, null));
  assert.deepEqual(operations[9], create_operation("use", 2, 4, null));
  assert.deepEqual(operations[10], create_operation("delete", 1, 1, null));
  assert.deepEqual(operations[14], create_operation("kill", 1, null, null));
});

// =============================================
// Parser: formatos tolerados
// ---------------------------------------------

test("accepts CRLF line endings and blank lines", () => {
  const text = "new(1,500)\r\n\r\nuse(1)\r\n\r\nkill(1)\r\n\r\n";

  assert.equal(parse_operations(text).length, 3);
});

test("accepts spaces inside and around operations", () => {
  const text = "  new ( 1 , 500 )  \n\tuse( 1 )\n kill (1)";

  assert.equal(parse_operations(text).length, 3);
});

test("accepts operations separated by commas on one line", () => {
  const text = "new(1,500), use(1), kill(1)";

  assert.equal(parse_operations(text).length, 3);
});

test("accepts a file without final newline", () => {
  assert.equal(parse_operations("new(1,10)\nkill(1)").length, 2);
});

test("accepts uppercase operation names", () => {
  assert.equal(parse_operations("NEW(1,10)\nKILL(1)").length, 2);
});

test("ignores // comments like the ones in the statement", () => {
  const text = "new(1,250) //suponga que devuelve el ptr 1\nuse(1)\nkill(1) // fin";

  assert.equal(parse_operations(text).length, 3);
});

test("ignores a leading BOM", () => {
  assert.equal(parse_operations("﻿new(1,10)\nkill(1)").length, 2);
});

// =============================================
// Parser: errores de sintaxis
// ---------------------------------------------

test("rejects text that is not an operation", () => {
  assert.throws(() => parse_operations("new(1,10)\nhello\nkill(1)"), /Texto inesperado/);
});

test("rejects an empty file", () => {
  assert.throws(() => parse_operations("  \n\n"), /no tiene operaciones/);
});

test("rejects a new with the wrong number of arguments", () => {
  assert.throws(() => parse_operations("new(1)"), /new espera 2 argumentos/);
});

test("rejects a use with the wrong number of arguments", () => {
  assert.throws(() => parse_operations("new(1,10)\nuse(1,2)"), /use espera 1 argumento/);
});

test("rejects non integer arguments", () => {
  assert.throws(() => parse_operations("new(1,abc)"), /el tamaño debe ser un entero no negativo/);
  assert.throws(() => parse_operations("new(1,-5)"), /el tamaño debe ser un entero no negativo/);
  assert.throws(() => parse_operations("new(1,2.5)"), /el tamaño debe ser un entero no negativo/);
});

test("rejects a non string input", () => {
  assert.throws(() => parse_operations(null), /debe ser una cadena/);
});

// =============================================
// Validacion de reglas del enunciado
// ---------------------------------------------

test("rejects use of a ptr that was never created", () => {
  assert.throws(() => parse_operations("new(1,10)\nuse(2)"), /el ptr 2 nunca fue creado/);
});

test("rejects use of a deleted ptr", () => {
  const text = "new(1,10)\ndelete(1)\nuse(1)";

  assert.throws(() => parse_operations(text), /el ptr 1 ya fue borrado/);
});

test("rejects delete of a deleted ptr", () => {
  const text = "new(1,10)\ndelete(1)\ndelete(1)";

  assert.throws(() => parse_operations(text), /el ptr 1 ya fue borrado/);
});

test("rejects use of a ptr whose process was killed", () => {
  const text = "new(1,10)\nkill(1)\nuse(1)";

  assert.throws(() => parse_operations(text), /que ya terminó con kill/);
});

test("rejects new after the kill of the same process", () => {
  const text = "new(1,10)\nkill(1)\nnew(1,10)";

  assert.throws(() => parse_operations(text), /el proceso 1 ya terminó con kill/);
});

test("rejects a second kill of the same process", () => {
  const text = "new(1,10)\nkill(1)\nkill(1)";

  assert.throws(() => parse_operations(text), /el proceso 1 ya terminó con kill/);
});

test("rejects zero as pid or size", () => {
  assert.throws(() => parse_operations("new(0,10)"), /el pid debe ser un entero positivo/);
  assert.throws(() => parse_operations("new(1,0)"), /el tamaño debe ser un entero positivo/);
});

test("validate rejects a use with the wrong owner pid", () => {
  const operations = [
    create_operation("new", 1, 1, 10),
    create_operation("use", 2, 1, null),
  ];

  assert.throws(() => validate_operations(operations), /pertenece al proceso 1, no al 2/);
});

test("validate rejects a new with a non sequential ptr", () => {
  const operations = [create_operation("new", 1, 5, 10)];

  assert.throws(() => validate_operations(operations), /se esperaba el ptr 1, se recibió 5/);
});

test("validate rejects an empty list", () => {
  assert.throws(() => validate_operations([]), /al menos una operación/);
});

test("validate accepts processes interleaved freely", () => {
  const operations = parse_operations("new(1,10)\nnew(2,10)\nuse(1)\nuse(2)\nkill(2)\nkill(1)");

  assert.doesNotThrow(() => validate_operations(operations));
});

// =============================================
// Serializacion
// ---------------------------------------------

test("serialize reproduces the Annex 1 file exactly", () => {
  const operations = parse_operations(ANEXO_1_TEXT);

  assert.equal(serialize_operations(operations), ANEXO_1_TEXT);
});

test("parse of a serialized list returns the same operations", () => {
  const operations = parse_operations(ANEXO_1_TEXT);
  const round_trip = parse_operations(serialize_operations(operations));

  assert.deepEqual(round_trip, operations);
});

test("serialize rejects an invalid operation type", () => {
  const operations = [{ type: "free", pid: 1, ptr: null, size: null }];

  assert.throws(() => serialize_operations(operations), /Tipo de operación inválido/);
});
