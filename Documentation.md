# Documentation

## Descripción general

Simulador de una MMU con paginación para el Proyecto 2 de Sistemas Operativos. Corre en paralelo OPT y un algoritmo elegido (FIFO, SC, LRU o LFU) sobre las mismas operaciones, y visualiza RAM, tabla de la MMU y métricas de ambos.

## Parámetros del sistema simulado

| Parámetro | Valor |
|---|---|
| Núcleos / instrucciones por segundo | 1 / 1 |
| RAM | 400 KB (100 páginas) |
| Tamaño de página | 4 KB (4096 B) |
| Acceso a disco (fallo) | 5 s |
| Hit | 1 s |
| Disco | Ilimitado |

## Arquitectura

El motor es JavaScript puro, sin UI, y la interfaz solo lee su estado.

```
src/engine/
  types.js        Constantes y fábricas (operación, página)
  rng.js          PRNG con semilla (mulberry32)
  parser.js       Archivo -> lista de operaciones
  generator.js    (seed, P, N) -> lista de operaciones válida
  mmu.js          MMU genérica que recibe un algoritmo
  simulator.js    Corre 2 MMU coordinadas, una operación por paso
  algorithms/     fifo, sc, lru, lfu, opt
src/ui/           Pantalla de preparación y de simulación
```

Interfaz de algoritmo: `on_load(page)`, `on_access(page)`, `choose_victim(candidates, context)`.

## Stack

JavaScript ESM sin dependencias. Tests con `node:test`. La UI se sirve como archivos estáticos.

## Pendiente

- Parser, generador y exportación.
- MMU, reloj y métricas.
- Algoritmos FIFO, SC, LRU, LFU y OPT.
- UI de preparación y de simulación.
- Reglas a decidir y documentar: desempate de LFU, si `freq` se reinicia al bajar a disco, ptr de más de 100 páginas.

## Decision Log

### 2026-10-08 - Stack JavaScript vanilla sin dependencias

- El plan original proponía TypeScript, React, Vite y Vitest.
- Se descartó para mantener el proyecto en JavaScript con ESM y sin dependencias externas.
- Tests con `node:test` y UI con módulos nativos del navegador.
