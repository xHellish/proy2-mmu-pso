# MMU Simulator

Simulador de paginación de memoria para el Proyecto 2 de Sistemas Operativos. Compara el algoritmo óptimo (OPT) contra FIFO, Second Chance (SC), LRU o LFU sobre la misma secuencia de operaciones.

> Estado: scaffold inicial. El motor (parser, generador, MMU y algoritmos) está pendiente de implementar.

## Stack

- JavaScript con módulos ESM, sin dependencias externas.
- UI en HTML, CSS y JavaScript nativo.
- Tests con el runner integrado de Node (`node:test`).

## Requisitos

- Node.js 20 o superior.
- Python 3 (solo para servir los archivos estáticos).

## Instalación y ejecución

No hay dependencias que instalar.

```
# Correr los tests del motor
npm test

# Servir la interfaz y abrir http://localhost:8080/src/ui/index.html
npm start
```

## Estructura

```
src/engine/       Motor de la simulación (sin UI)
src/engine/algorithms/   FIFO, SC, LRU, LFU y OPT
src/ui/           Interfaz web
tests/            Tests del motor
examples/         Archivos de operaciones de ejemplo (Anexo 1)
```

## Formato del archivo de operaciones

Una operación por línea (o separadas por comas). Los punteros se numeran por orden de aparición de cada `new`.

```
new(1,500)
use(1)
kill(1)
```
