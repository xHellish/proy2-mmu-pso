// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import {
  TABLE_COLUMNS,
  format_number,
  format_seconds,
  format_kb,
  format_percent,
  format_bytes_as_kb,
  is_thrashing_alert,
  get_mark_text,
  get_page_cells,
  get_stat_texts,
} from "../src/ui/format.js";
import { get_visible_range } from "../src/ui/virtual_table.js";
import { get_pid_color } from "../src/ui/colors.js";
import { create_page } from "../src/engine/types.js";

// =============================================
// Formato de numeros
// ---------------------------------------------

test("format_number keeps one decimal and drops a zero decimal", () => {
  assert.equal(format_number(61), "61");
  assert.equal(format_number(63.456), "63.5");
  assert.equal(format_number(0), "0");
  assert.equal(format_number(2.04), "2");
});

test("units are appended like in the statement example", () => {
  assert.equal(format_seconds(250), "250s");
  assert.equal(format_kb(244), "244KB");
  assert.equal(format_percent(61), "61%");
  assert.equal(format_bytes_as_kb(3596), "3.5KB");
  assert.equal(format_bytes_as_kb(0), "0KB");
});

test("V-RAM can be shown above 100 percent", () => {
  assert.equal(format_percent(125), "125%");
});

// =============================================
// Alerta de thrashing
// ---------------------------------------------

test("thrashing is an alert only above 50 percent", () => {
  assert.equal(is_thrashing_alert(50), false);
  assert.equal(is_thrashing_alert(50.1), true);
  assert.equal(is_thrashing_alert(0), false);
  assert.equal(is_thrashing_alert(100), true);
});

// =============================================
// Celdas de la tabla de la MMU
// ---------------------------------------------

test("MARK shows the reference bit only for SC", () => {
  const page = create_page(1, 1, 1);
  page.ref_bit = 1;

  assert.equal(get_mark_text("SC", page), "1");
  assert.equal(get_mark_text("FIFO", page), "-");
  assert.equal(get_mark_text("LRU", page), "-");
  assert.equal(get_mark_text("LFU", page), "-");
});

test("a page in RAM fills the loaded, frame and loaded time columns", () => {
  const page = create_page(7, 2, 3);
  page.in_ram = true;
  page.frame = 12;
  page.loaded_at = 36;

  const cells = get_page_cells(page, "FIFO");

  assert.equal(cells.length, TABLE_COLUMNS.length);
  assert.deepEqual(cells, ["7", "2", "X", "3", "12", "", "36s", "-"]);
});

test("a page on disk fills the disk address and leaves the RAM columns empty", () => {
  const page = create_page(8, 2, 3);
  page.disk_addr = 5;
  page.loaded_at = 40;

  const cells = get_page_cells(page, "SC");

  assert.deepEqual(cells, ["8", "2", "", "3", "", "5", "", "0"]);
});

test("a page in frame 0 shows 0 and not an empty cell", () => {
  const page = create_page(1, 1, 1);
  page.in_ram = true;
  page.frame = 0;

  assert.equal(get_page_cells(page, "FIFO")[4], "0");
});

// =============================================
// Indicadores
// ---------------------------------------------

test("get_stat_texts formats every indicator of the statement", () => {
  const texts = get_stat_texts({
    clock_seconds: 250,
    active_processes: 5,
    loaded_pages: 61,
    unloaded_pages: 10,
    ram_kb: 244,
    ram_percent: 61,
    vram_kb: 40,
    vram_percent: 10,
    thrashing_seconds: 150,
    thrashing_percent: 60,
    fragmentation_bytes: 256000,
    page_hits: 100,
    page_faults: 30,
  });

  assert.deepEqual(texts, {
    processes: "5",
    sim_time: "250s",
    ram_kb: "244KB",
    ram_percent: "61%",
    vram_kb: "40KB",
    vram_percent: "10%",
    loaded_pages: "61",
    unloaded_pages: "10",
    thrashing_time: "150s",
    thrashing_percent: "60%",
    fragmentation: "250KB",
    hits: "100",
    faults: "30",
  });
});

// =============================================
// Tabla virtualizada
// ---------------------------------------------

test("get_visible_range starts at the top with overscan below", () => {
  const range = get_visible_range(0, 220, 22, 1000, 5);

  assert.deepEqual(range, { first: 0, last: 15 });
});

test("get_visible_range follows the scroll position", () => {
  const range = get_visible_range(2200, 220, 22, 1000, 5);

  assert.deepEqual(range, { first: 95, last: 115 });
});

test("get_visible_range never goes past the last row", () => {
  const range = get_visible_range(21780, 220, 22, 1000, 5);

  assert.equal(range.last, 1000);
  assert.ok(range.first < range.last);
});

test("get_visible_range is empty when there are no rows", () => {
  assert.deepEqual(get_visible_range(0, 220, 22, 0, 5), { first: 0, last: 0 });
});

test("get_visible_range draws only a small window out of thousands of rows", () => {
  const range = get_visible_range(50000, 330, 22, 10000, 5);

  assert.ok(range.last - range.first < 40);
});

test("get_visible_range rejects a row height that is not positive", () => {
  assert.throws(() => get_visible_range(0, 220, 0, 100, 5), /La altura de fila debe ser positiva/);
});

// =============================================
// Colores por proceso
// ---------------------------------------------

test("a pid always gets the same color and nearby pids get different ones", () => {
  assert.equal(get_pid_color(3, 60), get_pid_color(3, 60));
  assert.notEqual(get_pid_color(1, 60), get_pid_color(2, 60));
  assert.notEqual(get_pid_color(1, 60), get_pid_color(1, 85));
});

test("the colors of the first 100 pids are all different", () => {
  const colors = new Set();
  for (let pid = 1; pid <= 100; pid++) {
    colors.add(get_pid_color(pid, 60));
  }

  assert.equal(colors.size, 100);
});
