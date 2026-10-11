// =============================================
// Imports
// ---------------------------------------------

import { create_setup_screen } from "./setup_screen.js";
import { create_simulation_screen } from "./simulation_screen.js";

// =============================================
// Pantallas
// ---------------------------------------------

const setup_element = document.getElementById("setup_screen");
const simulation_element = document.getElementById("simulation_screen");

// Muestra la pantalla de preparacion y oculta la de simulacion
function show_setup() {
  simulation_element.hidden = true;
  setup_element.hidden = false;
}

// Pasa a la pantalla de simulacion con el escenario elegido
function handle_start(scenario) {
  // Paso 1: crear primero la simulacion; si falla, el error vuelve a la pantalla de preparacion
  simulation_screen.start(scenario);

  // Paso 2: solo si salio bien, cambiar de pantalla
  setup_element.hidden = true;
  simulation_element.hidden = false;
}

const simulation_screen = create_simulation_screen(simulation_element, show_setup);
const setup_screen = create_setup_screen(handle_start);

// =============================================
// Valores desde la URL
// ---------------------------------------------

// Lee un entero de la URL; devuelve undefined si no esta o no es un entero
function read_integer_param(params, name) {
  const raw_value = params.get(name);
  if (raw_value === null || !/^-?\d+$/.test(raw_value)) {
    return undefined;
  }
  return Number(raw_value);
}

// Permite abrir un escenario repetible, por ejemplo ?seed=1&algorithm=LRU&p=10&n=500&autostart=1
function apply_url_preset() {
  const params = new URLSearchParams(window.location.search);
  let algorithm_name = params.get("algorithm");
  if (algorithm_name !== null) {
    algorithm_name = algorithm_name.toUpperCase();
  }
  setup_screen.apply_preset({
    seed: read_integer_param(params, "seed"),
    algorithm_name: algorithm_name,
    process_count: read_integer_param(params, "p"),
    operation_count: read_integer_param(params, "n"),
  });
  if (params.get("autostart") === "1") {
    setup_screen.submit();
  }
}

apply_url_preset();
