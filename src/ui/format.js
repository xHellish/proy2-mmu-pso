// =============================================
// Imports
// ---------------------------------------------

import { THRASHING_ALERT_RATIO } from "../engine/types.js";

// =============================================
// Constantes
// ---------------------------------------------

export const TABLE_COLUMNS = ["PAGE ID", "PID", "LOADED", "L-ADDR", "M-ADDR", "D-ADDR", "LOADED-T", "MARK"];

const THRASHING_ALERT_PERCENT = THRASHING_ALERT_RATIO * 100;
const BYTES_PER_KB = 1024;

// =============================================
// Formato de numeros
// ---------------------------------------------

// Redondea a un decimal y quita el decimal si es cero
export function format_number(value) {
  return String(Number(value.toFixed(1)));
}

// Formatea segundos, por ejemplo 250s
export function format_seconds(value) {
  return `${format_number(value)}s`;
}

// Formatea kilobytes, por ejemplo 244KB
export function format_kb(value) {
  return `${format_number(value)}KB`;
}

// Formatea un porcentaje, por ejemplo 61%
export function format_percent(value) {
  return `${format_number(value)}%`;
}

// Formatea bytes como kilobytes
export function format_bytes_as_kb(bytes) {
  return format_kb(bytes / BYTES_PER_KB);
}

// El thrashing se marca en rojo cuando supera el 50 % del tiempo total
export function is_thrashing_alert(percent) {
  return percent > THRASHING_ALERT_PERCENT;
}

// =============================================
// Textos de la tabla y de los indicadores
// ---------------------------------------------

// Texto de la columna MARK: el bit de referencia solo existe en SC
export function get_mark_text(algorithm_name, page) {
  if (algorithm_name === "SC") {
    return String(page.ref_bit);
  }
  return "-";
}

// Convierte una pagina en las celdas de una fila de la tabla de la MMU
export function get_page_cells(page, algorithm_name) {
  // Paso 1: las columnas que dependen de si la pagina esta en RAM o en disco
  let loaded_text = "";
  let loaded_at_text = "";
  if (page.in_ram) {
    loaded_text = "X";
    loaded_at_text = format_seconds(page.loaded_at);
  }
  let frame_text = "";
  if (page.frame !== null) {
    frame_text = String(page.frame);
  }
  let disk_text = "";
  if (page.disk_addr !== null) {
    disk_text = String(page.disk_addr);
  }

  // Paso 2: armar la fila en el orden de TABLE_COLUMNS
  return [
    String(page.id),
    String(page.pid),
    loaded_text,
    String(page.ptr),
    frame_text,
    disk_text,
    loaded_at_text,
    get_mark_text(algorithm_name, page),
  ];
}

// Convierte las metricas de una MMU en los textos de los indicadores
export function get_stat_texts(metrics) {
  return {
    processes: String(metrics.active_processes),
    sim_time: format_seconds(metrics.clock_seconds),
    ram_kb: format_kb(metrics.ram_kb),
    ram_percent: format_percent(metrics.ram_percent),
    vram_kb: format_kb(metrics.vram_kb),
    vram_percent: format_percent(metrics.vram_percent),
    loaded_pages: String(metrics.loaded_pages),
    unloaded_pages: String(metrics.unloaded_pages),
    thrashing_time: format_seconds(metrics.thrashing_seconds),
    thrashing_percent: format_percent(metrics.thrashing_percent),
    fragmentation: format_bytes_as_kb(metrics.fragmentation_bytes),
    hits: String(metrics.page_hits),
    faults: String(metrics.page_faults),
  };
}
