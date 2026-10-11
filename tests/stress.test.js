// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_mmu } from "../src/engine/mmu.js";
import { create_simulator } from "../src/engine/simulator.js";
import { create_algorithm, create_opt_algorithm } from "../src/engine/algorithms/index.js";
import { generate_operations } from "../src/engine/generator.js";
import { parse_operations, serialize_operations } from "../src/engine/parser.js";
import { create_rng, random_int } from "../src/engine/rng.js";
import {
  VALID_ALGORITHMS,
  VALID_PROCESS_COUNTS,
  VALID_OPERATION_COUNTS,
  PAGE_SIZE_BYTES,
  RAM_PAGES,
} from "../src/engine/types.js";

// =============================================
// Constantes
// ---------------------------------------------

// Tiempo maximo por corrida completa; es muy holgado para no depender de la maquina
const MAX_RUN_MILLISECONDS = 5000;
const ALL_ALGORITHMS = [...VALID_ALGORITHMS, "OPT"];

// =============================================
// Utilidades
// ---------------------------------------------

// Crea el algoritmo por nombre; OPT necesita la lista de operaciones
function make_algorithm(name, operations) {
  if (name === "OPT") {
    return create_opt_algorithm(operations);
  }
  return create_algorithm(name);
}

// Revisa que el estado de la MMU sea coherente consigo mismo
function check_invariants(mmu, label) {
  const pages = mmu.get_pages();
  const frames = mmu.get_frames();
  const metrics = mmu.get_metrics();

  assert.equal(frames.length, RAM_PAGES, `${label}: cantidad de marcos`);

  // Cada marco ocupado apunta a una pagina que dice estar en ese marco
  const page_by_id = new Map();
  for (const page of pages) {
    page_by_id.set(page.id, page);
  }
  for (let frame_index = 0; frame_index < frames.length; frame_index++) {
    const frame = frames[frame_index];
    if (frame === null) {
      continue;
    }
    const page = page_by_id.get(frame.page_id);
    assert.notEqual(page, undefined, `${label}: el marco ${frame_index} apunta a una pagina inexistente`);
    assert.equal(page.in_ram, true, `${label}: la pagina ${page.id} esta en un marco pero no en RAM`);
    assert.equal(page.frame, frame_index, `${label}: la pagina ${page.id} no coincide con su marco`);
  }

  // Cada pagina en RAM ocupa su marco, y cada pagina en disco tiene direccion de disco
  let in_ram_count = 0;
  for (const page of pages) {
    if (page.in_ram) {
      in_ram_count++;
      assert.notEqual(frames[page.frame], null, `${label}: la pagina ${page.id} no tiene marco`);
      assert.equal(frames[page.frame].page_id, page.id, `${label}: marco ${page.frame} de otra pagina`);
      assert.equal(page.disk_addr, null, `${label}: la pagina ${page.id} en RAM tiene direccion de disco`);
    } else {
      assert.equal(page.frame, null, `${label}: la pagina ${page.id} en disco tiene marco`);
      assert.ok(Number.isInteger(page.disk_addr), `${label}: la pagina ${page.id} en disco no tiene direccion`);
    }
  }

  // Las metricas coinciden con el estado
  assert.ok(in_ram_count <= RAM_PAGES, `${label}: mas de 100 paginas en RAM`);
  assert.equal(metrics.loaded_pages, in_ram_count, `${label}: paginas cargadas`);
  assert.equal(metrics.unloaded_pages, pages.length - in_ram_count, `${label}: paginas descargadas`);
  assert.equal(metrics.ram_kb, in_ram_count * 4, `${label}: RAM en KB`);
  assert.equal(metrics.thrashing_seconds, metrics.page_faults * 5, `${label}: thrashing`);
  assert.equal(metrics.clock_seconds, metrics.page_faults * 5 + metrics.page_hits, `${label}: reloj`);
}

// Ejecuta las operaciones comparando la MMU contra un calculo independiente despues de cada paso
function run_checked(operations, algorithm_name, check_every) {
  const mmu = create_mmu(make_algorithm(algorithm_name, operations));
  const live_by_ptr = new Map();
  const active_pids = new Set();

  for (const [index, operation] of operations.entries()) {
    mmu.execute(operation);

    // Actualizar el calculo independiente
    if (operation.type === "new") {
      const page_count = Math.ceil(operation.size / PAGE_SIZE_BYTES);
      live_by_ptr.set(operation.ptr, {
        pid: operation.pid,
        page_count,
        waste: page_count * PAGE_SIZE_BYTES - operation.size,
      });
      active_pids.add(operation.pid);
    } else if (operation.type === "delete") {
      live_by_ptr.delete(operation.ptr);
    } else if (operation.type === "kill") {
      for (const [ptr, live] of [...live_by_ptr.entries()]) {
        if (live.pid === operation.pid) {
          live_by_ptr.delete(ptr);
        }
      }
      active_pids.delete(operation.pid);
    }

    // Comparar cada cierta cantidad de pasos y siempre en el ultimo
    if (index % check_every === 0 || index === operations.length - 1) {
      let expected_pages = 0;
      let expected_waste = 0;
      for (const live of live_by_ptr.values()) {
        expected_pages += live.page_count;
        expected_waste += live.waste;
      }
      const label = `${algorithm_name} operacion ${index + 1} (${serialize_operations([operation]).trim()})`;
      const metrics = mmu.get_metrics();
      assert.equal(metrics.loaded_pages + metrics.unloaded_pages, expected_pages, `${label}: total de paginas`);
      assert.equal(metrics.fragmentation_bytes, expected_waste, `${label}: fragmentacion`);
      assert.equal(metrics.active_processes, active_pids.size, `${label}: procesos activos`);
      check_invariants(mmu, label);
    }
  }
  return mmu.get_metrics();
}

// Genera una traza que incluye bloques de mas de 100 paginas
function build_big_trace(seed, process_count, operation_count) {
  const next_random = create_rng(seed);
  const lines = [];
  const live_ptrs_by_pid = new Map();
  let next_ptr = 1;
  for (let pid = 1; pid <= process_count; pid++) {
    live_ptrs_by_pid.set(pid, []);
  }

  for (let step = 0; step < operation_count; step++) {
    const pid = random_int(next_random, 1, process_count);
    const live_ptrs = live_ptrs_by_pid.get(pid);
    const roll = random_int(next_random, 1, 100);

    if (live_ptrs.length === 0 || roll <= 20) {
      const size_roll = random_int(next_random, 1, 100);
      let pages = 1;
      if (size_roll > 92) {
        pages = random_int(next_random, 90, 220);
      } else if (size_roll > 70) {
        pages = random_int(next_random, 2, 10);
      }
      const size = random_int(next_random, (pages - 1) * PAGE_SIZE_BYTES + 1, pages * PAGE_SIZE_BYTES);
      lines.push(`new(${pid},${size})`);
      live_ptrs.push(next_ptr);
      next_ptr++;
    } else if (roll <= 80) {
      lines.push(`use(${live_ptrs[random_int(next_random, 0, live_ptrs.length - 1)]})`);
    } else {
      const position = random_int(next_random, 0, live_ptrs.length - 1);
      lines.push(`delete(${live_ptrs[position]})`);
      live_ptrs.splice(position, 1);
    }
  }
  for (let pid = 1; pid <= process_count; pid++) {
    lines.push(`kill(${pid})`);
  }
  return lines.join("\n") + "\n";
}

// =============================================
// Carga maxima: todas las combinaciones de P y N
// ---------------------------------------------

test("every algorithm finishes every P and N combination within the time limit", () => {
  for (const process_count of VALID_PROCESS_COUNTS) {
    for (const operation_count of VALID_OPERATION_COUNTS) {
      const operations = generate_operations(1, process_count, operation_count);

      for (const name of VALID_ALGORITHMS) {
        const started = performance.now();
        const simulator = create_simulator(name, operations);
        simulator.step_many(operation_count);
        const elapsed = performance.now() - started;

        const label = `${name} P=${process_count} N=${operation_count}`;
        assert.equal(simulator.is_finished(), true, label);
        assert.ok(elapsed < MAX_RUN_MILLISECONDS, `${label} tardo ${Math.round(elapsed)} ms`);
      }
    }
  }
});

test("both MMUs finish together on every P and N combination", () => {
  for (const process_count of VALID_PROCESS_COUNTS) {
    for (const operation_count of VALID_OPERATION_COUNTS) {
      const simulator = create_simulator("LRU", generate_operations(2, process_count, operation_count));
      const label = `P=${process_count} N=${operation_count}`;

      let steps = 0;
      while (simulator.step()) {
        steps++;
      }
      const snapshot = simulator.get_snapshot();

      assert.equal(steps, operation_count, label);
      assert.equal(snapshot.operation_index, operation_count, label);
      assert.equal(snapshot.finished, true, label);
      assert.equal(snapshot.opt.metrics.active_processes, 0, label);
      assert.equal(snapshot.selected.metrics.active_processes, 0, label);
      assert.equal(snapshot.opt.pages.length, 0, label);
      assert.equal(snapshot.selected.pages.length, 0, label);
    }
  }
});

test("the state stays consistent after every operation with P=100 and N=1000", () => {
  const operations = generate_operations(5, 100, 1000);

  for (const name of ALL_ALGORITHMS) {
    run_checked(operations, name, 1);
  }
});

test("a complete P=100 and N=5000 run keeps the state consistent", () => {
  const operations = generate_operations(9, 100, 5000);

  for (const name of ALL_ALGORITHMS) {
    run_checked(operations, name, 250);
  }
});

// =============================================
// Bloques de mas de 100 paginas
// ---------------------------------------------

test("a trace with blocks larger than the RAM stays consistent for every algorithm", () => {
  for (const seed of [1, 2, 3, 4]) {
    const operations = parse_operations(build_big_trace(seed, 8, 300));

    for (const name of ALL_ALGORITHMS) {
      run_checked(operations, name, 1);
    }
  }
});

test("OPT never loses to another algorithm with blocks larger than the RAM", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const operations = parse_operations(build_big_trace(seed, 8, 300));
    const opt_metrics = run_checked(operations, "OPT", 300);

    for (const name of VALID_ALGORITHMS) {
      const metrics = run_checked(operations, name, 300);
      assert.ok(opt_metrics.page_faults <= metrics.page_faults, `seed ${seed}, ${name}: fallos`);
      assert.ok(opt_metrics.clock_seconds <= metrics.clock_seconds, `seed ${seed}, ${name}: reloj`);
    }
  }
});

test("block sizes around the 100 page boundary work for every algorithm", () => {
  // 99, 100, 101, 150 y 1000 paginas, cada una pedida, usada dos veces y liberada
  for (const pages of [99, 100, 101, 150, 1000]) {
    const text = `new(1,${pages * PAGE_SIZE_BYTES})\nuse(1)\nuse(1)\nkill(1)`;
    const operations = parse_operations(text);

    for (const name of ALL_ALGORITHMS) {
      const metrics = run_checked(operations, name, 1);
      assert.equal(metrics.loaded_pages, 0, `${name} ${pages} paginas`);
      assert.equal(metrics.unloaded_pages, 0, `${name} ${pages} paginas`);
      assert.ok(metrics.page_faults >= pages, `${name} ${pages} paginas`);
    }
  }
});

test("a block that exactly fills the RAM never faults on use", () => {
  const operations = parse_operations(`new(1,${RAM_PAGES * PAGE_SIZE_BYTES})\nuse(1)\nuse(1)`);

  for (const name of ALL_ALGORITHMS) {
    const metrics = run_checked(operations, name, 1);
    assert.equal(metrics.page_faults, 100, name);
    assert.equal(metrics.page_hits, 200, name);
  }
});

test("a block of 101 pages costs 1010 seconds with FIFO, LRU, SC and LFU but less with OPT", () => {
  const operations = parse_operations("new(1,410000)\nuse(1)\nkill(1)");

  for (const name of VALID_ALGORITHMS) {
    assert.equal(run_checked(operations, name, 1).clock_seconds, 1010, name);
  }
  assert.equal(run_checked(operations, "OPT", 1).clock_seconds, 610);
});

test("two processes with blocks larger than the RAM share it without errors", () => {
  const text = [
    "new(1,450000)",
    "new(2,450000)",
    "use(1)",
    "use(2)",
    "use(1)",
    "delete(2)",
    "use(1)",
    "kill(1)",
    "kill(2)",
  ].join("\n");
  const operations = parse_operations(text);

  for (const name of ALL_ALGORITHMS) {
    run_checked(operations, name, 1);
  }
});

// =============================================
// Archivos con formato irregular
// ---------------------------------------------

test("a messy file gives exactly the same operations as a clean one", () => {
  const clean = parse_operations("new(1,500)\nuse(1)\nnew(2,50)\nuse(2)\ndelete(1)\nkill(1)\nkill(2)\n");
  const messy = [
    "﻿",
    "   NEW ( 1 , 500 ) ,use(1)\r\n",
    "\r\n\r\n",
    "\tnew(2,50)// comentario\r\n",
    " use ( 2 ) , delete(1)\n",
    ",,\n",
    "kill(1),KILL(2),",
  ].join("");

  assert.deepEqual(parse_operations(messy), clean);
});

test("old Mac line endings with only CR work", () => {
  const operations = parse_operations("new(1,10)\ruse(1)\rkill(1)\r");

  assert.equal(operations.length, 3);
});

test("a file with one operation per comma and no line breaks works", () => {
  const operations = parse_operations("new(1,10),use(1),new(1,20),use(2),delete(1),kill(1)");

  assert.equal(operations.length, 6);
});

test("a file without trailing newline and with trailing blank lines work the same", () => {
  const without_newline = parse_operations("new(1,10)\nkill(1)");
  const with_blank_lines = parse_operations("new(1,10)\nkill(1)\n\n\n\n");

  assert.deepEqual(without_newline, with_blank_lines);
});

test("numbers with leading zeros are read as numbers", () => {
  const operations = parse_operations("new(001,0500)\nuse(1)\nkill(001)");

  assert.equal(operations[0].pid, 1);
  assert.equal(operations[0].size, 500);
});

test("a large messy file parses quickly", () => {
  const lines = [];
  for (let index = 0; index < 100000; index++) {
    lines.push("  new( 1 , 10 ) ,  ");
  }
  lines.push("kill(1)");
  const started = performance.now();
  const operations = parse_operations(lines.join("\r\n"));
  const elapsed = performance.now() - started;

  assert.equal(operations.length, 100001);
  assert.ok(elapsed < MAX_RUN_MILLISECONDS, `tardo ${Math.round(elapsed)} ms`);
});

// =============================================
// Procesos y tamanos poco comunes
// ---------------------------------------------

test("pids that are not contiguous, are large or are 0 work", () => {
  const text = "new(0,100)\nnew(7,5000)\nnew(1000000,100)\nuse(2)\nuse(3)\nkill(7)\nuse(1)\nkill(0)\nkill(1000000)";
  const operations = parse_operations(text);

  for (const name of ALL_ALGORITHMS) {
    const metrics = run_checked(operations, name, 1);
    assert.equal(metrics.active_processes, 0, name);
  }
});

test("blocks of size 0 and of exactly one byte over a page work", () => {
  const text = `new(1,0)\nuse(1)\nnew(1,${PAGE_SIZE_BYTES + 1})\nuse(2)\nnew(1,${PAGE_SIZE_BYTES})\nuse(3)\nkill(1)`;
  const operations = parse_operations(text);

  for (const name of ALL_ALGORITHMS) {
    const metrics = run_checked(operations, name, 1);
    assert.equal(metrics.page_faults, 3, name);
  }
});

test("a process that never does anything but kill works", () => {
  const operations = parse_operations("new(1,10)\nkill(5)\nkill(1)");

  for (const name of ALL_ALGORITHMS) {
    run_checked(operations, name, 1);
  }
});

test("many processes asking for a little memory each fill the RAM and replace pages", () => {
  const lines = [];
  for (let pid = 1; pid <= 300; pid++) {
    lines.push(`new(${pid},4096)`);
  }
  for (let ptr = 1; ptr <= 300; ptr++) {
    lines.push(`use(${ptr})`);
  }
  for (let pid = 1; pid <= 300; pid++) {
    lines.push(`kill(${pid})`);
  }
  const operations = parse_operations(lines.join("\n"));

  for (const name of ALL_ALGORITHMS) {
    const metrics = run_checked(operations, name, 10);
    assert.equal(metrics.active_processes, 0, name);
  }
});
