// =============================================
// Imports
// ---------------------------------------------

import { create_element } from "./dom.js";

// =============================================
// Constantes
// ---------------------------------------------

// Tope de avisos en pantalla, para que un archivo con miles de errores no congele la pagina
const MAX_VISIBLE_WARNINGS = 200;

// =============================================
// Lista de avisos del archivo
// ---------------------------------------------

// Llena el contenedor con los avisos del archivo; sin avisos lo oculta
export function fill_warning_list(container, warnings) {
  // Paso 1: sin avisos no se muestra nada
  if (warnings.length === 0) {
    container.replaceChildren();
    container.hidden = true;
    return;
  }

  // Paso 2: titulo con la cantidad y explicacion de que pasa con ellos
  let title_text = `${warnings.length} avisos`;
  if (warnings.length === 1) {
    title_text = "1 aviso";
  }
  const title = create_element("p", "warning_title", `${title_text}: la simulación corre igual y salta estas líneas u operaciones.`);

  // Paso 3: lista con un aviso por fila, hasta el tope
  const list = create_element("ul", "warning_list");
  let visible_count = warnings.length;
  if (visible_count > MAX_VISIBLE_WARNINGS) {
    visible_count = MAX_VISIBLE_WARNINGS;
  }
  for (let index = 0; index < visible_count; index++) {
    list.appendChild(create_element("li", "", warnings[index]));
  }
  if (warnings.length > visible_count) {
    list.appendChild(create_element("li", "warning_more", `y ${warnings.length - visible_count} avisos más`));
  }

  container.replaceChildren(title, list);
  container.hidden = false;
}
