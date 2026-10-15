// =============================================
// Imports
// ---------------------------------------------

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

// =============================================
// Rutas del sitio
// ---------------------------------------------

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

// Se sirve solo src/: el motor (engine) y la interfaz (ui); nada mas del proyecto queda expuesto
export const SITE_DIR = path.resolve(SERVER_DIR, "..", "src");

const HOME_PATH = "ui/";

// =============================================
// Manejadores
// ---------------------------------------------

// Agrega los encabezados de seguridad que no estorban a los modulos del navegador
function set_security_headers(request, response, next) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  next();
}

// Lleva la raiz a la pantalla del simulador conservando los parametros de la URL
function handle_root(request, response) {
  // Paso 1: separar los parametros (por ejemplo ?seed=1&algorithm=LRU) si los hay
  const search_start = request.originalUrl.indexOf("?");
  let search = "";
  if (search_start !== -1) {
    search = request.originalUrl.slice(search_start);
  }

  // Paso 2: redirigir con una ruta relativa, para que funcione aunque el sitio viva bajo un prefijo
  response.redirect(`${HOME_PATH}${search}`);
}

// Responde con un mensaje en espanol cuando la ruta no existe
function handle_not_found(request, response) {
  response.status(404).type("text/plain; charset=utf-8").send("Página no encontrada");
}

// Registra el error con su detalle y responde sin exponerlo al visitante
function handle_error(error, request, response, next) {
  console.error(`Request failed: ${request.method} ${request.originalUrl}`, error);
  if (response.headersSent) {
    next(error);
    return;
  }
  response.status(500).type("text/plain; charset=utf-8").send("Error interno del servidor");
}

// =============================================
// Aplicacion
// ---------------------------------------------

// Crea la aplicacion Express que sirve el simulador como archivos estaticos
export function create_app() {
  const app = express();
  app.disable("x-powered-by");

  // Orden: encabezados, raiz, archivos estaticos y al final los errores
  app.use(set_security_headers);
  app.get("/", handle_root);
  app.use(express.static(SITE_DIR));
  app.use(handle_not_found);
  app.use(handle_error);

  return app;
}
