// =============================================
// Imports
// ---------------------------------------------

import { create_app } from "./app.js";

// =============================================
// Configuracion
// ---------------------------------------------

const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;

// Lee el puerto de la variable PORT; si no existe usa el puerto por defecto
function read_port() {
  // Paso 1: sin variable, se usa el puerto por defecto
  const raw_port = process.env.PORT;
  if (raw_port === undefined || raw_port === "") {
    return DEFAULT_PORT;
  }

  // Paso 2: debe ser un entero entre 1 y 65535
  if (!/^\d+$/.test(raw_port) || Number(raw_port) < 1 || Number(raw_port) > MAX_PORT) {
    throw new Error(`PORT must be an integer between 1 and ${MAX_PORT}, received: "${raw_port}"`);
  }
  return Number(raw_port);
}

// =============================================
// Arranque
// ---------------------------------------------

// Lee el puerto y, si es invalido, informa el motivo en una linea y termina con error
function read_port_or_exit() {
  try {
    return read_port();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const port = read_port_or_exit();

// Informa que el servidor esta escuchando; Express tambien llama aqui si no pudo iniciar
function handle_listen(error) {
  // Paso 1: si no pudo iniciar, explicar el motivo y terminar con error
  if (error !== undefined) {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use, choose another one with PORT=<number>`);
    } else {
      console.error("The server could not start", error);
    }
    process.exit(1);
  }

  // Paso 2: quedo escuchando
  console.info(`MMU simulator listening on http://localhost:${port}`);
}

// Cierra el servidor con calma al recibir una senal de apagado
function create_shutdown_handler(server) {
  // Cierra las conexiones abiertas y termina el proceso
  function handle_shutdown(signal) {
    console.info(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
  }
  return handle_shutdown;
}

const server = create_app().listen(port, handle_listen);

const handle_shutdown = create_shutdown_handler(server);
process.on("SIGINT", handle_shutdown);
process.on("SIGTERM", handle_shutdown);
