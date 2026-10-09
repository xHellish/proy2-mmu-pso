// =============================================
// Imports
// ---------------------------------------------

import {
  VALID_ALGORITHMS,
  VALID_PROCESS_COUNTS,
  VALID_OPERATION_COUNTS,
} from "../engine/types.js";

// =============================================
// Funciones
// ---------------------------------------------

// Llena un select con las opciones recibidas
function fill_select(select_id, options) {
  // Paso 1: buscar el select
  const select = document.getElementById(select_id);
  if (select === null) {
    throw new Error(`Select not found: ${select_id}`);
  }

  // Paso 2: agregar una opcion por valor
  for (const option_value of options) {
    const option = document.createElement("option");
    option.value = option_value;
    option.textContent = option_value;
    select.appendChild(option);
  }
}

// Maneja el envio del formulario de preparacion
function handle_start(event) {
  // Paso 1: evitar que el formulario recargue la pagina
  event.preventDefault();

  // Paso 2: pendiente de implementar
  console.log("Simulation start is not implemented yet");
}

// =============================================
// Inicio
// ---------------------------------------------

fill_select("algorithm_select", VALID_ALGORITHMS);
fill_select("process_count_select", VALID_PROCESS_COUNTS);
fill_select("operation_count_select", VALID_OPERATION_COUNTS);
document.getElementById("setup_form").addEventListener("submit", handle_start);
