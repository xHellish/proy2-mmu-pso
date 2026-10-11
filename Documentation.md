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

### MMU

`create_mmu(algorithm)` devuelve `{ execute, get_metrics, get_pages, get_frames }`. Estado interno:

- `frames`: 100 marcos, cada uno con la página que lo ocupa o `null`.
- `pages`: todas las páginas existentes, en RAM o en disco.
- `memory_map`: `ptr` a lista de páginas.
- `symbol_table`: `pid` a conjunto de `ptr` del proceso.
- `next_ptr`: contador global, nunca se reutiliza.

`execute(operation)` ejecuta una operación completa. Reglas de reloj:

| Operación | Efecto | Reloj |
|---|---|---|
| `new` | Crea `ceil(size/4096)` páginas en RAM y suma `páginas*4096 - size` a la fragmentación | +5 s por página, siempre fallo y thrashing |
| `use` | Por cada página: hit si está en RAM, fallo si está en disco | +1 s por hit, +5 s por fallo (el fallo suma al thrashing) |
| `delete` | Borra las páginas del `ptr` y resta su fragmentación | 0 |
| `kill` | `delete` de todos los `ptr` del proceso y lo marca como terminado | 0 |

### Algoritmos de reemplazo

| Algoritmo | Víctima | Datos que usa |
|---|---|---|
| FIFO | Menor `loaded_at` | `loaded_at` (lo asigna la MMU) |
| SC | Cola FIFO; con `ref_bit` 1 lo pone en 0 y manda la página al final | `ref_bit` (columna MARK) y una cola propia |
| LRU | Menor `last_use` | Contador de accesos propio, no el reloj |
| LFU | Menor `freq`; empate: menor `loaded_at` y luego menor id | `freq` |
| OPT | `ptr` con el siguiente `use` más lejano; sin usos futuros cuenta como infinito; empate: menor `loaded_at` y luego menor id | Lista de operaciones completa, `operation_index` del contexto |

### Interfaz de algoritmo

Todo algoritmo expone `on_load(page, context)`, `on_access(page, context)`, `on_unload(page)` y `choose_victim(candidates, context)`. El `context` trae `operation_index`, el índice de la operación en curso (lo necesita OPT). La MMU asigna `loaded_at`, el marco y la dirección de disco; el algoritmo solo mantiene sus propios datos.

## Stack

JavaScript ESM sin dependencias. Tests con `node:test`. La UI se sirve como archivos estáticos.

## Pendiente

- Generador y botón de descarga en la UI.
- UI de preparación y de simulación.
- Mostrar la columna MARK solo para SC en la UI (el motor ya mantiene `ref_bit`).

## Decision Log

### 2026-10-10 - Reglas de SC, LRU y OPT

- SC: una página entra a RAM con `ref_bit` en 1, porque cargar cuenta como un acceso (igual que `freq` en 1 en LFU). Todo acceso lo pone en 1.
- SC lleva una cola propia y no modifica `loaded_at`, para que LOADED-T siga mostrando el instante real de carga. Al salir de RAM la página deja la cola y su bit vuelve a 0.
- SC lanza un error explícito si su cola no coincide con las páginas en RAM, en vez de decidir con datos inconsistentes.
- Consecuencia: con todas las páginas recién cargadas (bit 1), el primer desalojo de SC se comporta como FIFO. Se diferencia cuando hay accesos entre desalojos.
- LRU usa un contador de accesos propio y no el reloj, porque un `new` de varias páginas avanza el reloj de a 5 s pero un contador nunca empata.
- OPT mira la distancia por `ptr`, no por página. Las páginas de un mismo `ptr` empatan y se desempata como FIFO. Esa regla se usa para cualquier empate, no solo dentro del mismo `ptr`.
- OPT necesita que la MMU ejecute las operaciones en orden desde el índice 0, porque compara `operation_index` con las posiciones de la lista que recibió al crearse.
- Un `ptr` que se borra antes de volver a usarse no necesita caso aparte: la validación del parser impide un `use` posterior, así que ya no tiene usos futuros.
- Comprobación: sobre 10 semillas de 600 operaciones, OPT nunca tiene más fallos, tiempo ni thrashing que FIFO, SC, LRU o LFU.

### 2026-10-10 - Diseño de la MMU y de la interfaz de algoritmos

- La MMU es la misma para todos los algoritmos. Solo cambia la estrategia que recibe en `create_mmu`.
- Interfaz de algoritmo: `on_load`, `on_access`, `on_unload` y `choose_victim`. Se agregó `on_unload` porque una página sale de RAM por desalojo y también por `delete` o `kill`, y un algoritmo con cola propia (SC) necesita enterarse en ambos casos.
- Una carga desde disco o una página nueva llama a `on_load` y no a `on_access`: cargar ya cuenta como el acceso.
- `loaded_at` es el reloj después de cobrar el fallo. Como cada carga cuesta al menos 5 s, nunca hay dos iguales.
- Los candidatos a víctima son todas las páginas en RAM. La página que se está cargando aún no está en RAM, así que no puede ser elegida.
- La dirección de disco (`disk_addr`) es un contador incremental que se asigna al desalojar y se borra al volver a RAM.
- El `ptr` de un `new` se compara con `next_ptr` antes de modificar el estado, para que un error no deje páginas a medias.
- Páginas cargadas y descargadas son conteos actuales, no acumulados, como en el Anexo 2 (RAM KB = cargadas por 4).
- V-RAM se mide como porcentaje de la RAM, así que puede pasar de 100 %.
- `kill` de un proceso que nunca pidió memoria se acepta y no hace nada, salvo marcarlo como terminado.

### 2026-10-10 - Parser tolerante en el formato y estricto en las reglas

- Formato tolerado: espacios, tabulaciones, líneas vacías, `\r\n`, BOM, mayúsculas, operaciones separadas por comas en una misma línea y comentarios `//` como los del enunciado.
- Cualquier otro texto en el archivo es un error explícito, para no ignorar en silencio una operación mal escrita.
- Los `ptr` se numeran por orden de aparición de cada `new`, empezando en 1.
- Modelo de operación: `{ type, pid, ptr, size }`. `new` trae su `ptr` asignado y `size`. `use` y `delete` traen el `pid` dueño, resuelto desde el `ptr`, porque el archivo no lo incluye. `kill` solo usa `pid`.
- `parse_operations` valida las reglas del enunciado al terminar. Rechaza `use` o `delete` de un `ptr` inexistente o ya borrado, cualquier operación de un proceso después de su `kill`, un segundo `kill` y un `new` con `ptr` no secuencial.
- Riesgo asumido: si el archivo del profesor rompiera una de esas reglas, el simulador lo rechazaría con un mensaje que indica la operación.
- `serialize_operations` escribe una operación por línea, con salto de línea final, y es la inversa exacta de `parse_operations` para el Anexo 1.

### 2026-10-09 - Columna MARK solo se llena en Second Chance

- La columna MARK aparece siempre en la tabla de la MMU, como en el Anexo 2 del enunciado, para ambos paneles.
- En SC muestra el bit de referencia (`ref_bit`: 0 o 1).
- En OPT, FIFO, LRU y LFU se muestra vacía (`-`), porque esos algoritmos no usan el bit.
- El motor puede mantener `ref_bit` en todas las páginas, pero solo SC lo consulta para decidir.

### 2026-10-09 - Reglas de LFU: desempate FIFO y freq se reinicia al desalojar

- Desempate: ante igual `freq`, se desaloja la página con menor `loaded_at` (la más antigua en RAM).
- `freq` cuenta los accesos mientras la página está en RAM. Una página recién cargada empieza en 1 (cuenta el acceso que la trajo).
- Al desalojar una página a disco, `freq` se reinicia a 0.
- Motivo: así una página muy usada en el pasado, pero ya fría, no queda protegida para siempre al volver a RAM.

### 2026-10-09 - Autodesalojo para un ptr de más de 100 páginas

- Un `new` de más de 400 KB (más de 100 páginas) no cabe entero en RAM. El enunciado no dice qué hacer y el archivo del profesor puede incluirlo.
- Regla: las páginas se cargan una por una con el ciclo normal. Si no hay marco libre, el algoritmo desaloja una víctima, que puede ser otra página del mismo `ptr`.
- Candidatos a víctima: todas las páginas en RAM, excepto la que se está cargando en ese momento.
- Reloj: cada página de `new` y de `use` que se trae suma 5 s y cuenta como thrashing, igual que cualquier fallo.
- OPT: las páginas del mismo `ptr` tienen la misma distancia futura, así que el desempate es FIFO (menor `loaded_at`).
- El parser acepta estos tamaños, pero el generador no los produce, para no distorsionar las comparaciones.
- Ejemplo con FIFO: `new(1,410000)` crea 101 páginas, suma 505 s y fragmentación de 3696 B, y deja una página en disco. Un `use(1)` posterior falla en las 101 páginas.

### 2026-10-08 - Stack JavaScript vanilla sin dependencias

- El plan original proponía TypeScript, React, Vite y Vitest.
- Se descartó para mantener el proyecto en JavaScript con ESM y sin dependencias externas.
- Tests con `node:test` y UI con módulos nativos del navegador.
