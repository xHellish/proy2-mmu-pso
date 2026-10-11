// =============================================
// Imports
// ---------------------------------------------

import { create_element } from "./dom.js";

// =============================================
// Constantes
// ---------------------------------------------

// Filas extra arriba y abajo de lo visible, para que el scroll rapido no muestre huecos
const OVERSCAN_ROWS = 5;

// =============================================
// Calculo de filas visibles
// ---------------------------------------------

// Calcula el rango de filas [first, last) que hay que dibujar para el scroll actual
export function get_visible_range(scroll_top, viewport_height, row_height, row_count, overscan) {
  // Paso 1: validar la altura de fila
  if (row_height <= 0) {
    throw new Error(`La altura de fila debe ser positiva, se recibió: ${row_height}`);
  }

  // Paso 2: primera y ultima fila visibles, con margen extra
  let first = Math.floor(scroll_top / row_height) - overscan;
  if (first < 0) {
    first = 0;
  }
  let last = Math.ceil((scroll_top + viewport_height) / row_height) + overscan;
  if (last > row_count) {
    last = row_count;
  }

  // Paso 3: con pocas filas o scroll fuera de rango el rango queda vacio
  if (first > last) {
    first = last;
  }
  return { first, last };
}

// =============================================
// Tabla virtualizada
// ---------------------------------------------

// Crea una tabla que solo dibuja las filas visibles, para soportar miles de paginas
export function create_virtual_table(options) {
  const { columns, row_height, viewport_height, get_cells, get_row_style } = options;

  // Paso 1: estructura: un contenedor con scroll, un encabezado fijo y el contenido
  const element = create_element("div", "vtable");
  const body = create_element("div", "vbody");
  body.style.height = `${viewport_height}px`;
  const grid_template = `repeat(${columns.length}, minmax(0, 1fr))`;

  const header = create_element("div", "vrow vheader");
  header.style.gridTemplateColumns = grid_template;
  header.style.height = `${row_height}px`;
  for (const column of columns) {
    header.appendChild(create_element("div", "vcell", column));
  }

  const content = create_element("div", "vcontent");
  const rows_layer = create_element("div", "vrows");
  content.appendChild(rows_layer);
  body.appendChild(header);
  body.appendChild(content);
  element.appendChild(body);

  let rows = [];

  // Dibuja solo las filas del rango visible
  function render() {
    // Paso 1: calcular el rango y colocar la capa de filas en su posicion
    const range = get_visible_range(body.scrollTop, viewport_height, row_height, rows.length, OVERSCAN_ROWS);
    rows_layer.style.top = `${range.first * row_height}px`;

    // Paso 2: crear los elementos de cada fila visible
    const row_elements = [];
    for (let row_index = range.first; row_index < range.last; row_index++) {
      const row = rows[row_index];
      const row_element = create_element("div", "vrow");
      row_element.style.gridTemplateColumns = grid_template;
      row_element.style.height = `${row_height}px`;
      Object.assign(row_element.style, get_row_style(row));
      for (const cell_text of get_cells(row)) {
        row_element.appendChild(create_element("div", "vcell", cell_text));
      }
      row_elements.push(row_element);
    }
    rows_layer.replaceChildren(...row_elements);
  }

  // Reemplaza las filas y ajusta el alto total para que el scroll refleje todas
  function set_rows(new_rows) {
    rows = new_rows;
    content.style.height = `${rows.length * row_height}px`;
    render();
  }

  body.addEventListener("scroll", render);
  return { element, set_rows };
}
