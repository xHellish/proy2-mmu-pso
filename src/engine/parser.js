// =============================================
// Parser del archivo de operaciones
// ---------------------------------------------

// Convierte el texto del archivo (Anexo 1) en una lista de operaciones
export function parse_operations(text) {
  // TODO: tolerar espacios, lineas vacias, \r\n y operaciones separadas por comas
  throw new Error("parse_operations is not implemented yet");
}

// Valida que la lista de operaciones respete las reglas del enunciado
export function validate_operations(operations) {
  // TODO: new antes de use/delete, un solo kill por proceso y ninguna operacion despues del kill
  throw new Error("validate_operations is not implemented yet");
}

// Convierte una lista de operaciones al formato del Anexo 1 para descargarla
export function serialize_operations(operations) {
  // TODO: una operacion por linea, por ejemplo new(1,500)
  throw new Error("serialize_operations is not implemented yet");
}
