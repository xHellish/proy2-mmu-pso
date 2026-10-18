// =============================================
// Imports
// ---------------------------------------------

import { build_scenario } from "../engine/scenario.js";
import { read_operations_file, serialize_operations } from "../engine/parser.js";
import { fill_warning_list } from "./warnings.js";
import { VALID_ALGORITHMS, VALID_PROCESS_COUNTS, VALID_OPERATION_COUNTS } from "../engine/types.js";

// =============================================
// Constantes
// ---------------------------------------------

const INTEGER_REGEX = /^-?\d+$/;
const NO_FILE_MESSAGE = "Sin archivo: las operaciones se generan con la semilla, P y N.";

// =============================================
// Funciones auxiliares
// ---------------------------------------------

// Llena un select con las opciones recibidas
function fill_select(select, options) {
  for (const option_value of options) {
    const option = document.createElement("option");
    option.value = option_value;
    option.textContent = option_value;
    select.appendChild(option);
  }
}

// Busca un elemento por id o lanza un error explicito
function get_element(element_id) {
  const element = document.getElementById(element_id);
  if (element === null) {
    throw new Error(`No se encontró el elemento: ${element_id}`);
  }
  return element;
}

// =============================================
// Pantalla de preparacion
// ---------------------------------------------

// Conecta el formulario de preparacion; on_start recibe el escenario cuando el usuario pulsa Start
export function create_setup_screen(on_start) {
  // Paso 1: elementos del formulario
  const form = get_element("setup_form");
  const seed_input = get_element("seed_input");
  const algorithm_select = get_element("algorithm_select");
  const process_count_select = get_element("process_count_select");
  const operation_count_select = get_element("operation_count_select");
  const file_input = get_element("file_input");
  const clear_file_button = get_element("clear_file_button");
  const file_status = get_element("file_status");
  const file_warnings = get_element("file_warnings");
  const download_button = get_element("download_button");
  const setup_error = get_element("setup_error");

  fill_select(algorithm_select, VALID_ALGORITHMS);
  fill_select(process_count_select, VALID_PROCESS_COUNTS);
  fill_select(operation_count_select, VALID_OPERATION_COUNTS);

  // Paso 2: archivo cargado, o null si las operaciones se generan
  let loaded_file = null;

  // Muestra un error de la pantalla de preparacion
  function show_error(message) {
    setup_error.textContent = message;
    setup_error.hidden = false;
  }

  // Oculta el error de la pantalla de preparacion
  function clear_error() {
    setup_error.textContent = "";
    setup_error.hidden = true;
  }

  // Con un archivo cargado la semilla, P, N y la descarga no se usan
  function set_generation_controls_disabled(disabled) {
    seed_input.disabled = disabled;
    process_count_select.disabled = disabled;
    operation_count_select.disabled = disabled;
    download_button.disabled = disabled;
    clear_file_button.hidden = !disabled;
  }

  // Lee los valores del formulario; la semilla debe ser un entero
  function read_form_options() {
    // Paso 1: validar la semilla antes de convertirla
    const raw_seed = seed_input.value.trim();
    if (!INTEGER_REGEX.test(raw_seed)) {
      throw new Error(`La semilla debe ser un entero, se recibió: "${raw_seed}"`);
    }

    // Paso 2: tomar el texto del archivo si hay uno cargado
    let file_text = null;
    if (loaded_file !== null) {
      file_text = loaded_file.text;
    }

    return {
      seed: Number(raw_seed),
      algorithm_name: algorithm_select.value,
      process_count: Number(process_count_select.value),
      operation_count: Number(operation_count_select.value),
      file_text,
    };
  }

  // =============================================
  // Eventos
  // ---------------------------------------------

  // Quita el archivo cargado y vuelve a generar las operaciones
  function clear_loaded_file() {
    loaded_file = null;
    file_input.value = "";
    file_status.textContent = NO_FILE_MESSAGE;
    fill_warning_list(file_warnings, []);
    set_generation_controls_disabled(false);
  }

  // Lee y valida el archivo elegido para avisar de errores antes de iniciar
  async function handle_file_change() {
    clear_error();
    const file = file_input.files[0];
    if (file === undefined) {
      clear_loaded_file();
      return;
    }

    try {
      // Paso 1: leer el archivo; lo ilegible o ilogico no lo invalida, solo genera avisos
      const text = await file.text();
      const { operations, warnings } = read_operations_file(text);
      loaded_file = { name: file.name, text };
      file_status.textContent = `Cargado ${file.name}: ${operations.length} operaciones. Se ignoran la semilla, P y N.`;
      set_generation_controls_disabled(true);

      // Paso 2: mostrar lo que se va a ignorar
      fill_warning_list(file_warnings, warnings);
    } catch (error) {
      console.error(error);
      clear_loaded_file();
      show_error(`Archivo inválido "${file.name}": ${error.message}`);
    }
  }

  // Genera las operaciones con la semilla actual y las descarga en el formato del Anexo 1
  function handle_download() {
    clear_error();
    try {
      // Paso 1: generar siempre con los valores del formulario, sin archivo
      const options = { ...read_form_options(), file_text: null };
      const scenario = build_scenario(options);
      const text = serialize_operations(scenario.operations);

      // Paso 2: descargar el texto como archivo
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `operaciones_semilla${options.seed}_P${options.process_count}_N${options.operation_count}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      show_error(error.message);
    }
  }

  // Arma el escenario y pasa a la simulacion
  function handle_submit(event) {
    event.preventDefault();
    clear_error();
    try {
      on_start(build_scenario(read_form_options()));
    } catch (error) {
      console.error(error);
      show_error(error.message);
    }
  }

  form.addEventListener("submit", handle_submit);
  file_input.addEventListener("change", handle_file_change);
  clear_file_button.addEventListener("click", clear_loaded_file);
  download_button.addEventListener("click", handle_download);
  file_status.textContent = NO_FILE_MESSAGE;
  clear_file_button.hidden = true;

  // =============================================
  // Interfaz publica
  // ---------------------------------------------

  // Rellena el formulario con valores recibidos, por ejemplo desde la URL
  function apply_preset(preset) {
    if (preset.seed !== undefined) {
      seed_input.value = String(preset.seed);
    }
    if (preset.algorithm_name !== undefined && VALID_ALGORITHMS.includes(preset.algorithm_name)) {
      algorithm_select.value = preset.algorithm_name;
    }
    if (preset.process_count !== undefined && VALID_PROCESS_COUNTS.includes(preset.process_count)) {
      process_count_select.value = String(preset.process_count);
    }
    if (preset.operation_count !== undefined && VALID_OPERATION_COUNTS.includes(preset.operation_count)) {
      operation_count_select.value = String(preset.operation_count);
    }
  }

  // Envia el formulario como si el usuario hubiera pulsado Start
  function submit() {
    form.requestSubmit();
  }

  return { apply_preset, submit };
}
