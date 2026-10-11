// =============================================
// Imports
// ---------------------------------------------

import { create_element } from "./dom.js";
import { create_panel } from "./panel.js";
import { create_simulator } from "../engine/simulator.js";

// =============================================
// Constantes
// ---------------------------------------------

// Velocidades disponibles en operaciones por segundo
const SPEEDS = [1, 2, 5, 10, 25, 50, 100, 500, 2000];
const DEFAULT_SPEED_INDEX = 3;

// Tope por cuadro para que una pestana inactiva no congele la pagina al volver
const MAX_STEPS_PER_FRAME = 2000;

// =============================================
// Pantalla de simulacion
// ---------------------------------------------

// Crea la pantalla de simulacion dentro de root_element; on_new_simulation vuelve a la preparacion
export function create_simulation_screen(root_element, on_new_simulation) {
  // Paso 1: barra de controles
  const controls = create_element("div", "controls");
  const title = create_element("strong", "sim_title", "");
  const description = create_element("span", "sim_description", "");
  const title_block = create_element("div", "title_block");
  title_block.appendChild(title);
  title_block.appendChild(description);

  const pause_button = create_element("button", "", "Pausar");
  pause_button.type = "button";
  pause_button.dataset.action = "pause";
  const step_button = create_element("button", "", "Paso");
  step_button.type = "button";
  step_button.dataset.action = "step";
  const end_button = create_element("button", "", "Ir al final");
  end_button.type = "button";
  end_button.dataset.action = "end";
  const new_button = create_element("button", "secondary", "Nueva simulación");
  new_button.type = "button";
  new_button.dataset.action = "new";

  const speed_label = create_element("label", "speed");
  const speed_text = create_element("span", "speed_text", "");
  const speed_input = create_element("input");
  speed_input.type = "range";
  speed_input.min = "0";
  speed_input.max = String(SPEEDS.length - 1);
  speed_input.value = String(DEFAULT_SPEED_INDEX);
  speed_label.appendChild(create_element("span", "", "Velocidad"));
  speed_label.appendChild(speed_input);
  speed_label.appendChild(speed_text);

  const progress = create_element("progress");
  progress.max = 1;
  progress.value = 0;
  const progress_text = create_element("span", "progress_text", "");
  const last_operation_text = create_element("span", "last_operation", "");
  const progress_block = create_element("div", "progress_block");
  progress_block.appendChild(progress);
  progress_block.appendChild(progress_text);
  progress_block.appendChild(last_operation_text);

  const status = create_element("p", "status", "");
  status.setAttribute("aria-live", "polite");
  const error_message = create_element("p", "error", "");
  error_message.setAttribute("role", "alert");
  error_message.hidden = true;

  controls.appendChild(title_block);
  controls.appendChild(pause_button);
  controls.appendChild(step_button);
  controls.appendChild(end_button);
  controls.appendChild(speed_label);
  controls.appendChild(new_button);
  controls.appendChild(progress_block);
  controls.appendChild(status);
  controls.appendChild(error_message);

  // Paso 2: contenedor de los dos paneles
  const panels = create_element("div", "panels");
  root_element.replaceChildren(controls, panels);

  // Paso 3: estado de la simulacion en curso
  let simulator = null;
  let opt_panel = null;
  let selected_panel = null;
  let running = false;
  let frame_id = null;
  let last_timestamp = null;
  let pending_steps = 0;

  // =============================================
  // Dibujo
  // ---------------------------------------------

  // Muestra el mensaje de estado segun la situacion actual
  function update_status(snapshot) {
    if (snapshot.finished) {
      status.textContent = `Terminada: ambas simulaciones procesaron las ${snapshot.total_operations} operaciones.`;
      if (snapshot.selected.metrics.active_processes === 0) {
        status.textContent += " Todos los procesos terminaron con kill, por eso la memoria quedó vacía.";
      }
    } else if (running) {
      status.textContent = "En ejecución";
    } else {
      status.textContent = "En pausa";
    }
  }

  // Habilita o deshabilita los botones segun si la simulacion termino
  function update_buttons(finished) {
    pause_button.disabled = finished;
    step_button.disabled = finished;
    end_button.disabled = finished;
    if (running) {
      pause_button.textContent = "Pausar";
    } else {
      pause_button.textContent = "Reanudar";
    }
  }

  // Dibuja el estado actual de ambas MMU, el progreso y el estado de los controles
  function render() {
    const snapshot = simulator.get_snapshot();
    opt_panel.render(snapshot.opt);
    selected_panel.render(snapshot.selected);

    progress.max = snapshot.total_operations;
    progress.value = snapshot.operation_index;
    progress_text.textContent = `Operación ${snapshot.operation_index} / ${snapshot.total_operations}`;
    if (snapshot.last_operation === null) {
      last_operation_text.textContent = "";
    } else {
      last_operation_text.textContent = `Última: ${snapshot.last_operation}`;
    }

    update_buttons(snapshot.finished);
    update_status(snapshot);
  }

  // Muestra un error de la simulacion y la pausa
  function show_error(error) {
    console.error(error);
    error_message.textContent = `Error en la simulación: ${error.message}`;
    error_message.hidden = false;
    pause_simulation();
  }

  // =============================================
  // Ciclo de ejecucion
  // ---------------------------------------------

  // Cancela el siguiente cuadro de animacion pendiente
  function cancel_frame() {
    if (frame_id !== null) {
      cancelAnimationFrame(frame_id);
      frame_id = null;
    }
  }

  // Pausa la simulacion sin perder el estado
  function pause_simulation() {
    running = false;
    cancel_frame();
    last_timestamp = null;
    if (simulator !== null) {
      render();
    }
  }

  // Avanza las operaciones que corresponden al tiempo transcurrido y dibuja
  function animation_frame(timestamp) {
    frame_id = null;
    if (!running) {
      return;
    }

    // Paso 1: cuantas operaciones tocan desde el ultimo cuadro, segun la velocidad
    if (last_timestamp === null) {
      last_timestamp = timestamp;
    }
    const elapsed_seconds = (timestamp - last_timestamp) / 1000;
    last_timestamp = timestamp;
    pending_steps += elapsed_seconds * SPEEDS[Number(speed_input.value)];
    let steps = Math.floor(pending_steps);
    pending_steps -= steps;
    if (steps > MAX_STEPS_PER_FRAME) {
      steps = MAX_STEPS_PER_FRAME;
    }

    // Paso 2: ejecutar las operaciones; un error detiene la simulacion con un mensaje
    try {
      simulator.step_many(steps);
    } catch (error) {
      show_error(error);
      return;
    }

    // Paso 3: dibujar y seguir si no termino
    if (simulator.is_finished()) {
      running = false;
      render();
      return;
    }
    render();
    frame_id = requestAnimationFrame(animation_frame);
  }

  // Inicia o reanuda la simulacion
  function resume_simulation() {
    if (simulator === null || simulator.is_finished()) {
      return;
    }
    running = true;
    last_timestamp = null;
    render();
    frame_id = requestAnimationFrame(animation_frame);
  }

  // =============================================
  // Controles
  // ---------------------------------------------

  // Alterna entre pausar y reanudar
  function handle_pause_click() {
    if (running) {
      pause_simulation();
    } else {
      resume_simulation();
    }
  }

  // Pausa y avanza una sola operacion en ambas MMU
  function handle_step_click() {
    pause_simulation();
    try {
      simulator.step();
    } catch (error) {
      show_error(error);
      return;
    }
    render();
  }

  // Pausa y ejecuta todas las operaciones que faltan
  function handle_end_click() {
    pause_simulation();
    try {
      simulator.step_many(Number.MAX_SAFE_INTEGER);
    } catch (error) {
      show_error(error);
      return;
    }
    render();
  }

  // Muestra la velocidad elegida en operaciones por segundo
  function handle_speed_change() {
    speed_text.textContent = `${SPEEDS[Number(speed_input.value)]} op/s`;
  }

  // Detiene la simulacion y vuelve a la pantalla de preparacion
  function handle_new_click() {
    stop();
    on_new_simulation();
  }

  pause_button.addEventListener("click", handle_pause_click);
  step_button.addEventListener("click", handle_step_click);
  end_button.addEventListener("click", handle_end_click);
  speed_input.addEventListener("input", handle_speed_change);
  new_button.addEventListener("click", handle_new_click);
  handle_speed_change();

  // =============================================
  // Interfaz publica
  // ---------------------------------------------

  // Detiene la simulacion en curso y libera el ciclo de animacion
  function stop() {
    running = false;
    cancel_frame();
    last_timestamp = null;
    pending_steps = 0;
  }

  // Empieza una simulacion nueva con el escenario recibido
  function start(scenario) {
    // Paso 1: limpiar lo anterior
    stop();
    error_message.hidden = true;

    // Paso 2: crear el simulador y los dos paneles, OPT a la izquierda
    simulator = create_simulator(scenario.algorithm_name, scenario.operations);
    opt_panel = create_panel("MMU - OPT", "OPT");
    selected_panel = create_panel(`MMU - ${scenario.algorithm_name}`, scenario.algorithm_name);
    panels.replaceChildren(opt_panel.element, selected_panel.element);
    title.textContent = `OPT vs ${scenario.algorithm_name}`;
    description.textContent = scenario.description;

    // Paso 3: arrancar corriendo
    resume_simulation();
  }

  return { start, stop };
}
