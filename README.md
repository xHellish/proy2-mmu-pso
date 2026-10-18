# MMU Simulator

Simulador de paginación de memoria para el Proyecto 2 de Sistemas Operativos. Compara el algoritmo óptimo (OPT) contra FIFO, Second Chance (SC), LRU o LFU sobre la misma secuencia de operaciones.

> Estado: en desarrollo. Ya funcionan el motor (parser, generador con semilla, MMU y los cinco algoritmos) y la interfaz de simulación. Faltan el despliegue y el informe.

## Stack

- HTML y CSS planos, sin frameworks ni herramientas de build.
- JavaScript nativo (módulos ESM) en el navegador: el motor de simulación y la interfaz corren en el cliente.
- Express como único servidor y única dependencia. Solo entrega los archivos estáticos.
- Tests con el runner integrado de Node (`node:test`).

## Requisitos

- Node.js 18 o superior y npm.
- Un navegador moderno. Se probó en Firefox.

En Debian:

```
sudo apt install nodejs npm
```

## Instalación y ejecución

```
# Instalar Express
npm install

# Iniciar el servidor y abrir http://localhost:3000
npm start

# Correr los tests
npm test
```

El puerto por defecto es 3000. Para cambiarlo: `PORT=8080 npm start`.

## Despliegue

El sitio se puede publicar en cualquier servicio que ejecute Node.js 18 o superior:

| Dato | Valor |
|---|---|
| Comando de instalación | `npm install` (o `npm ci`) |
| Comando de inicio | `npm start` |
| Puerto | El servicio lo define con la variable `PORT`; el servidor la lee solo |
| Variables obligatorias | Ninguna |
| Dirección de entrada | La raíz `/` redirige a `/ui/` conservando los parámetros de la URL |

Un servicio gratuito puede suspender el sitio tras un rato sin visitas, y la primera carga después de eso tarda. Conviene abrir el sitio una vez antes de compartir la dirección.

## Uso

1. Elige semilla, algoritmo, número de procesos (P) y de operaciones (N), o carga un archivo de operaciones. Con archivo se ignoran semilla, P y N.
2. "Descargar archivo" baja el archivo generado, para repetir la simulación o compartirla.
3. "Iniciar" abre la simulación: OPT a la izquierda y el algoritmo elegido a la derecha, avanzando una operación en ambos por paso.
4. Controles: Pausar/Reanudar, Paso, Ir al final y velocidad.

También se puede abrir un escenario directo con la URL, por ejemplo `http://localhost:3000/?seed=1&algorithm=LRU&p=10&n=500&autostart=1`.

## Estructura

```
server/           Servidor Express que entrega el sitio
src/engine/       Motor de la simulación (sin UI)
src/engine/algorithms/   FIFO, SC, LRU, LFU y OPT
src/ui/           Interfaz web: HTML, CSS y JavaScript
tests/            Tests del motor y del servidor
examples/         Archivos de operaciones de ejemplo (Anexo 1)
```

El servidor publica solo la carpeta `src/`. El resto del proyecto (tests, ejemplos, configuración) no se sirve.

## Formato del archivo de operaciones

Una operación por línea (o separadas por comas). Los punteros se numeran por orden de aparición de cada `new`.

```
new(1,500)
use(1)
kill(1)
```
