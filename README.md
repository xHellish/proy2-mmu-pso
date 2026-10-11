# MMU Simulator

Simulador de paginación de memoria para el Proyecto 2 de Sistemas Operativos. Compara el algoritmo óptimo (OPT) contra FIFO, Second Chance (SC), LRU o LFU sobre la misma secuencia de operaciones.

> Estado: en desarrollo. Ya funcionan el motor (parser, generador con semilla, MMU y los cinco algoritmos) y la interfaz de simulación. Faltan pruebas de carga, el despliegue y el informe.

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

## Uso

1. Elige semilla, algoritmo, número de procesos (P) y de operaciones (N), o carga un archivo de operaciones. Con archivo se ignoran semilla, P y N.
2. "Descargar archivo" baja el archivo generado, para repetir la simulación o compartirla.
3. "Iniciar" abre la simulación: OPT a la izquierda y el algoritmo elegido a la derecha, avanzando una operación en ambos por paso.
4. Controles: Pausar/Reanudar, Paso, Ir al final y velocidad.

También se puede abrir un escenario directo con la URL, por ejemplo `http://localhost:8080/src/ui/index.html?seed=1&algorithm=LRU&p=10&n=500&autostart=1`.

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
