// =============================================
// Utilidades del DOM
// ---------------------------------------------

// Crea un elemento con clase y texto opcionales
export function create_element(tag, class_name, text_content) {
  const element = document.createElement(tag);
  if (class_name !== undefined && class_name !== "") {
    element.className = class_name;
  }
  if (text_content !== undefined) {
    element.textContent = text_content;
  }
  return element;
}

// =============================================
// Iconos
// ---------------------------------------------

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Trazos de cada icono en una caja de 16x16
const ICON_PATHS = {
  pause: "M4 3h3v10H4zM9 3h3v10H9z",
  play: "M4 2.5v11l9-5.5z",
  step: "M3 2.5v11l7-5.5zM11 3h2.5v10H11z",
  end: "M1.5 2.5v11l6-5.5zM7.5 2.5v11l6-5.5zM13.5 3H15v10h-1.5z",
};

// Crea un icono SVG que hereda el color del texto; no depende de fuentes del sistema
export function create_icon(name) {
  // Paso 1: el icono debe existir
  const path_data = ICON_PATHS[name];
  if (path_data === undefined) {
    throw new Error(`Icono desconocido: ${name}`);
  }

  // Paso 2: armar el SVG con un solo trazo relleno
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon");
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", path_data);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}
