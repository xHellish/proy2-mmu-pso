// =============================================
// Imports
// ---------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { create_app } from "../server/app.js";

// =============================================
// Utilidades
// ---------------------------------------------

// Levanta el servidor en un puerto libre y devuelve su direccion base y como cerrarlo
async function start_server() {
  const server = create_app().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base_url = `http://127.0.0.1:${server.address().port}`;

  // Cierra el servidor y sus conexiones abiertas
  async function close() {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  return { base_url, close };
}

// Pide una ruta sin seguir las redirecciones
async function get(base_url, route) {
  return fetch(`${base_url}${route}`, { redirect: "manual" });
}

// =============================================
// Raiz y redireccion
// ---------------------------------------------

test("the root redirects to the simulator", async () => {
  const { base_url, close } = await start_server();
  try {
    const response = await get(base_url, "/");

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "ui/");
  } finally {
    await close();
  }
});

test("the root keeps the URL parameters when it redirects", async () => {
  const { base_url, close } = await start_server();
  try {
    const response = await get(base_url, "/?seed=7&algorithm=LRU&p=10&n=500&autostart=1");

    assert.equal(response.headers.get("location"), "ui/?seed=7&algorithm=LRU&p=10&n=500&autostart=1");
  } finally {
    await close();
  }
});

// =============================================
// Archivos del sitio
// ---------------------------------------------

test("the simulator page is served as HTML", async () => {
  const { base_url, close } = await start_server();
  try {
    const response = await get(base_url, "/ui/");
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(body, /<title>Simulador de MMU<\/title>/);
  } finally {
    await close();
  }
});

test("styles and scripts are served with the types the browser needs", async () => {
  const { base_url, close } = await start_server();
  try {
    const css = await get(base_url, "/ui/styles.css");
    const main_script = await get(base_url, "/ui/main.js");
    const engine_script = await get(base_url, "/engine/mmu.js");

    assert.match(css.headers.get("content-type"), /text\/css/);
    assert.match(main_script.headers.get("content-type"), /javascript/);
    assert.match(engine_script.headers.get("content-type"), /javascript/);
    await css.text();
    await main_script.text();
    await engine_script.text();
  } finally {
    await close();
  }
});

test("every module the page needs can be loaded from the server", async () => {
  const { base_url, close } = await start_server();
  try {
    // Seguir los import relativos desde main.js, como hace el navegador
    const pending = [`${base_url}/ui/main.js`];
    const seen = new Set();

    while (pending.length > 0) {
      const url = pending.pop();
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);

      const response = await fetch(url);
      const source = await response.text();
      assert.equal(response.status, 200, `${url} no se pudo cargar`);
      assert.match(response.headers.get("content-type"), /javascript/, `${url} tiene un tipo incorrecto`);

      for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
        pending.push(new URL(match[1], url).href);
      }
    }

    // main, las pantallas, el panel, la tabla, el formato y todo el motor
    assert.ok(seen.size >= 20, `solo se cargaron ${seen.size} modulos`);
  } finally {
    await close();
  }
});

test("the page links to files that exist", async () => {
  const { base_url, close } = await start_server();
  try {
    const page = await (await fetch(`${base_url}/ui/`)).text();
    const links = [...page.matchAll(/(?:href|src)="([^"]+)"/g)];

    assert.ok(links.length >= 2);
    for (const link of links) {
      const response = await fetch(new URL(link[1], `${base_url}/ui/`));
      assert.equal(response.status, 200, `${link[1]} no existe`);
      await response.text();
    }
  } finally {
    await close();
  }
});

test("the example file is not exposed but the engine is", async () => {
  const { base_url, close } = await start_server();
  try {
    assert.equal((await get(base_url, "/examples/anexo1.txt")).status, 404);
    assert.equal((await get(base_url, "/engine/rng.js")).status, 200);
  } finally {
    await close();
  }
});

// =============================================
// Seguridad
// ---------------------------------------------

test("project files outside src are not served", async () => {
  const { base_url, close } = await start_server();
  try {
    const routes = [
      "/package.json",
      "/package-lock.json",
      "/server/app.js",
      "/tests/server.test.js",
      "/node_modules/express/package.json",
      "/docs/spec.md",
      "/Documentation.md",
      "/.git/config",
      "/.env",
    ];

    for (const route of routes) {
      const response = await get(base_url, route);
      assert.equal(response.status, 404, `${route} deberia dar 404`);
      await response.text();
    }
  } finally {
    await close();
  }
});

test("a path traversal attempt does not reach files outside src", async () => {
  const { base_url, close } = await start_server();
  try {
    const attempts = ["/ui/..%2f..%2fpackage.json", "/%2e%2e/package.json", "/ui/%2e%2e%2f%2e%2e%2fpackage.json"];

    for (const attempt of attempts) {
      const response = await get(base_url, attempt);
      const body = await response.text();
      assert.notEqual(response.status, 200, `${attempt} no deberia dar 200`);
      assert.equal(body.includes("mmu-simulator-pso"), false, `${attempt} filtro el package.json`);
    }
  } finally {
    await close();
  }
});

test("responses carry the security headers and hide the framework", async () => {
  const { base_url, close } = await start_server();
  try {
    const response = await get(base_url, "/ui/");
    await response.text();

    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-powered-by"), null);
  } finally {
    await close();
  }
});

// =============================================
// Errores
// ---------------------------------------------

test("an unknown route answers 404 in Spanish", async () => {
  const { base_url, close } = await start_server();
  try {
    const response = await get(base_url, "/no-existe");
    const body = await response.text();

    assert.equal(response.status, 404);
    assert.equal(body, "Página no encontrada");
  } finally {
    await close();
  }
});

test("a POST to the site is not served", async () => {
  const { base_url, close } = await start_server();
  try {
    const response = await fetch(`${base_url}/ui/`, { method: "POST", body: "x" });
    await response.text();

    assert.equal(response.status, 404);
  } finally {
    await close();
  }
});
