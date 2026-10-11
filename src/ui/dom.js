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
