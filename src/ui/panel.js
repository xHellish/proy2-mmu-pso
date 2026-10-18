// =============================================
// Imports
// ---------------------------------------------

import { create_element } from "./dom.js";
import { create_virtual_table } from "./virtual_table.js";
import { get_pid_color } from "./colors.js";
import { TABLE_COLUMNS, get_page_cells, get_stat_texts, is_thrashing_alert } from "./format.js";
import { RAM_PAGES } from "../engine/types.js";

// =============================================
// Constantes
// ---------------------------------------------

const TABLE_ROW_HEIGHT = 22;
const TABLE_VIEWPORT_HEIGHT = 330;
const RAM_CELL_LIGHTNESS = 58;
const TABLE_ROW_LIGHTNESS = 90;
const DISK_ROW_OPACITY = "0.55";

// Indicadores agrupados por fila; thrashing y fragmentacion se marcan aparte
const STAT_ROWS = [
  [
    { key: "processes", label: "Procesos" },
    { key: "sim_time", label: "Tiempo simulado" },
  ],
  [
    { key: "ram_kb", label: "RAM KB" },
    { key: "ram_percent", label: "RAM %" },
    { key: "vram_kb", label: "V-RAM KB" },
    { key: "vram_percent", label: "V-RAM %" },
  ],
  [
    { key: "loaded_pages", label: "Páginas cargadas" },
    { key: "unloaded_pages", label: "Páginas descargadas" },
    { key: "thrashing_time", label: "Thrashing" },
    { key: "thrashing_percent", label: "Thrashing %" },
    { key: "fragmentation", label: "Fragmentación" },
  ],
  [
    { key: "hits", label: "Aciertos" },
    { key: "faults", label: "Fallos" },
  ],
];

const THRASHING_KEYS = ["thrashing_time", "thrashing_percent"];

// =============================================
// Panel de una MMU
// ---------------------------------------------

// Crea el panel de una MMU: barra de RAM, tabla de paginas e indicadores
export function create_panel(title, algorithm_name) {
  // Paso 1: encabezado del panel con una etiqueta que distingue a OPT del algoritmo elegido
  const element = create_element("section", "panel card");
  const panel_header = create_element("div", "panel_header");
  panel_header.appendChild(create_element("h2", "panel_title", title));
  if (algorithm_name === "OPT") {
    element.classList.add("panel_opt");
    panel_header.appendChild(create_element("span", "panel_tag", "Referencia óptima"));
  } else {
    element.classList.add("panel_selected");
    panel_header.appendChild(create_element("span", "panel_tag", "Algoritmo elegido"));
  }
  element.appendChild(panel_header);

  // Paso 2: barra de RAM con una celda por marco
  const ram_bar = create_element("div", "ram_bar");
  const ram_cells = [];
  for (let frame_index = 0; frame_index < RAM_PAGES; frame_index++) {
    const ram_cell = create_element("div", "ram_cell");
    ram_cells.push(ram_cell);
    ram_bar.appendChild(ram_cell);
  }
  element.appendChild(create_element("h3", "section_title", "RAM"));
  element.appendChild(ram_bar);

  // Paso 3: tabla de la MMU con las columnas del enunciado
  // Texto de las celdas de una fila
  function get_cells_for_row(page) {
    return get_page_cells(page, algorithm_name);
  }

  // Color de fondo de una fila segun el proceso; las paginas en disco se atenuan
  function get_style_for_row(page) {
    let opacity = "1";
    if (!page.in_ram) {
      opacity = DISK_ROW_OPACITY;
    }
    return { background: get_pid_color(page.pid, TABLE_ROW_LIGHTNESS), opacity };
  }

  const table = create_virtual_table({
    columns: TABLE_COLUMNS,
    row_height: TABLE_ROW_HEIGHT,
    viewport_height: TABLE_VIEWPORT_HEIGHT,
    get_cells: get_cells_for_row,
    get_row_style: get_style_for_row,
    empty_text: "No hay páginas en memoria ni en disco.",
  });
  element.appendChild(create_element("h3", "section_title", "MMU"));
  element.appendChild(table.element);

  // Paso 4: indicadores, guardando el elemento de cada valor para actualizarlo
  const stat_values = new Map();
  const stats = create_element("div", "stats");
  for (const stat_row of STAT_ROWS) {
    const row_element = create_element("div", "stat_row");
    for (const stat of stat_row) {
      const cell = create_element("div", "stat");
      const value = create_element("div", "stat_value", "");
      cell.appendChild(create_element("div", "stat_label", stat.label));
      cell.appendChild(value);
      row_element.appendChild(cell);
      stat_values.set(stat.key, value);
    }
    stats.appendChild(row_element);
  }
  element.appendChild(stats);

  // Dibuja la foto de una MMU en el panel
  function render(snapshot) {
    // Paso 1: la barra de RAM, coloreada por PID
    for (let frame_index = 0; frame_index < RAM_PAGES; frame_index++) {
      const frame = snapshot.frames[frame_index];
      const ram_cell = ram_cells[frame_index];
      if (frame === null) {
        ram_cell.style.background = "";
        ram_cell.title = `Marco ${frame_index}: libre`;
      } else {
        ram_cell.style.background = get_pid_color(frame.pid, RAM_CELL_LIGHTNESS);
        ram_cell.title = `Marco ${frame_index}: página ${frame.page_id} (PID ${frame.pid}, ptr ${frame.ptr})`;
      }
    }

    // Paso 2: la tabla de paginas
    table.set_rows(snapshot.pages);

    // Paso 3: los indicadores; el thrashing se marca en rojo si supera el 50 %
    const texts = get_stat_texts(snapshot.metrics);
    for (const [key, value_element] of stat_values.entries()) {
      value_element.textContent = texts[key];
    }
    const alert = is_thrashing_alert(snapshot.metrics.thrashing_percent);
    for (const key of THRASHING_KEYS) {
      stat_values.get(key).parentElement.classList.toggle("alert", alert);
    }
  }

  return { element, render };
}
