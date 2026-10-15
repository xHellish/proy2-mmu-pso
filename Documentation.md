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

El motor es JavaScript puro, sin UI, y la interfaz solo lee su estado. Un servidor Express entrega el sitio y no participa en la simulación.

```
server/
  app.js          create_app: Express con los archivos estáticos de src/, redirección de la raíz y errores
  index.js        Arranque: lee PORT, escucha y se apaga con SIGINT y SIGTERM
src/engine/
  types.js        Constantes y fábricas (operación, página)
  rng.js          PRNG con semilla (mulberry32)
  parser.js       Archivo -> lista de operaciones
  generator.js    (seed, P, N) -> lista de operaciones válida
  scenario.js     Datos de la pantalla de preparación -> escenario (operaciones + algoritmo)
  mmu.js          MMU genérica que recibe un algoritmo
  simulator.js    Corre 2 MMU coordinadas, una operación por paso
  algorithms/     fifo, sc, lru, lfu, opt
src/ui/
  index.html, styles.css
  main.js               Une las dos pantallas y lee los valores de la URL
  setup_screen.js       Formulario: semilla, algoritmo, P, N, archivo y descarga
  simulation_screen.js  Controles y ciclo de ejecución con requestAnimationFrame
  panel.js              Panel de una MMU: barra de RAM, tabla e indicadores
  virtual_table.js      Tabla que solo dibuja las filas visibles
  format.js, colors.js, dom.js   Textos, colores por PID y utilidades del DOM
```

Lo que no toca el DOM (`simulator.js`, `scenario.js`, `format.js`, el cálculo de filas visibles de `virtual_table.js` y `colors.js`) tiene tests con `node:test`. El código del DOM se verificó abriendo la página en un navegador.

### Servidor

`create_app()` en `server/app.js` arma una aplicación Express con cuatro piezas, en este orden:

1. Encabezados `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`; se oculta `X-Powered-By`.
2. La ruta `/` redirige a `ui/` conservando los parámetros de la URL (`?seed=1&algorithm=LRU&autostart=1`). La redirección es relativa para que funcione si el sitio vive bajo un prefijo.
3. `express.static` sobre la carpeta `src/`. Solo se publica el motor y la interfaz; `package.json`, los tests, los ejemplos y `node_modules` devuelven 404.
4. Respuestas de error en español: 404 "Página no encontrada" y 500 "Error interno del servidor", con el detalle registrado en la consola del servidor.

`server/index.js` lee el puerto de la variable `PORT` (3000 por defecto, entre 1 y 65535) y termina con un mensaje de una línea si el puerto es inválido o está ocupado. Con SIGINT o SIGTERM cierra el servidor y sale con código 0.

El navegador pide el JavaScript como módulos ES, así que el servidor debe responder con tipo `text/javascript`. Un test recorre todos los `import` desde `main.js`, como hace el navegador, y comprueba que cada módulo se carga con el tipo correcto.

### Simulador coordinado

`create_simulator(algorithm_name, operations)` crea dos MMU, una con OPT y otra con el algoritmo elegido, y avanza una operación en ambas por paso (`step`, `step_many`). Cada MMU tiene su propio reloj. `get_snapshot()` devuelve una copia del estado de ambas (métricas, páginas y marcos), la operación más reciente y el progreso, así que un paso posterior nunca cambia una foto anterior.

### Interfaz

- **Preparación**: semilla, algoritmo (FIFO, SC, LRU, LFU), P, N y archivo opcional. Con un archivo cargado se ignoran semilla, P y N, y se avisa de cualquier error del archivo antes de iniciar. "Descargar archivo" baja el archivo generado en el formato del Anexo 1.
- **Simulación**: dos paneles lado a lado, OPT a la izquierda. Cada panel tiene la barra de RAM de 100 celdas coloreadas por PID, la tabla de la MMU (PAGE ID, PID, LOADED, L-ADDR, M-ADDR, D-ADDR, LOADED-T, MARK) y los indicadores del enunciado, más hits y fallos.
- **Controles**: Pausar/Reanudar, Paso, Ir al final y velocidad (1 a 2000 operaciones por segundo). Al terminar, el mensaje explica por qué la memoria quedó vacía: el generador termina cada proceso con `kill`.
- **URL**: se puede abrir un escenario repetible con `?seed=1&algorithm=LRU&p=10&n=500&autostart=1`. Sirve para repetir una corrida o tomar las capturas del informe.

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

### Generador

`generate_operations(seed, P, N)` devuelve exactamente N operaciones válidas para P procesos, y la misma semilla produce siempre el mismo archivo. Pasos:

1. Reserva P operaciones para los `kill` y reparte las `N - P` restantes entre los procesos. Cada proceso recibe al menos una.
2. En cada paso elige un proceso vivo al azar y una operación válida para él: sin `ptr` vivos solo puede hacer `new`.
3. Cuando un proceso agota su cuota, ejecuta su `kill` y sale del sorteo, así el `kill` es siempre su última operación.
4. Al final valida la lista con `validate_operations`.

Falla con error explícito si N es menor que `2 * P`, porque cada proceso necesita al menos una operación y su `kill`.

### Algoritmos de reemplazo

| Algoritmo | Víctima | Datos que usa |
|---|---|---|
| FIFO | Menor `loaded_at` | `loaded_at` (lo asigna la MMU) |
| SC | Cola FIFO; con `ref_bit` 1 lo pone en 0 y manda la página al final | `ref_bit` (columna MARK) y una cola propia |
| LRU | Menor `last_use` | Contador de accesos propio, no el reloj |
| LFU | Menor `freq`; empate: menor `loaded_at` y luego menor id | `freq` |
| OPT | Página cuyo siguiente acceso (operación y posición dentro del `ptr`) está más lejos; sin accesos futuros cuenta como infinito; empate: menor `loaded_at` y luego menor id | Lista de operaciones completa, `operation_index` y `page_index` del contexto |

### Interfaz de algoritmo

Todo algoritmo expone `on_load(page, context)`, `on_access(page, context)`, `on_unload(page)` y `choose_victim(candidates, context)`. El `context` trae `operation_index`, el índice de la operación en curso, y, al elegir víctima, `page_index`, la posición dentro de su `ptr` de la página que se está cargando (los dos los necesita OPT). Cada página guarda su posición en `index`. La MMU asigna `loaded_at`, el marco y la dirección de disco; el algoritmo solo mantiene sus propios datos.

## Stack

HTML y CSS planos, JavaScript nativo en el navegador y Express como único servidor y única dependencia. Tests con `node:test`, incluidos los del servidor.

## Pendiente

- Entrega técnica (Fase 7) e informe (Fase 8).

## Decision Log

### 2026-10-14 - Express como servidor y simulación en el navegador

- Stack final: HTML y CSS planos, JavaScript nativo en el navegador y Express. Express es la única dependencia y no hay frameworks ni herramientas de build.
- Express solo entrega archivos estáticos. La simulación sigue corriendo en el navegador, porque el enunciado exige una visualización en vivo y poder pausar y reanudar en cualquier momento. Con HTML y CSS solos eso solo sería posible recargando la página desde el servidor, con parpadeo y con una simulación por visitante guardada en el servidor.
- Alternativa descartada: ejecutar el motor en el servidor y exponer una API. Duplicaría el estado por usuario y obligaría a reescribir la capa de simulación sin ganar nada.
- Se publica únicamente `src/`. Es más seguro que servir la raíz del proyecto y mantiene las rutas de los módulos (`../engine/...`) intactas.
- La raíz `/` redirige a `ui/` con ruta relativa, para que el sitio funcione también detrás de un prefijo de URL.
- El servidor necesita Node 18 o superior, que es la versión de Debian 12, y se instala con `npm install`.
- Un sitio con Express necesita un host que ejecute Node. Un hosting de archivos estáticos como GitHub Pages no sirve para el servidor, aunque el contenido de `src/` sí funcionaría allí.
- Se probó en Firefox 157: la raíz redirige con los parámetros, arranca la simulación, carga todos los módulos, y con P=100 y N=5000 llega al final en 160 ms.

### 2026-10-11 - Fase 6: OPT por página, casos borde y límites

- OPT mide la distancia por página y no por `ptr`. La clave de cada página es la operación de su siguiente acceso y su posición dentro del `ptr`. Un `use` recorre las páginas en orden, así que dentro de un mismo `ptr` la más lejana es la de mayor posición. Dentro de un `use` en curso, las páginas del `ptr` que aún no se recorren cuentan como acceso inmediato.
- Motivo: con la regla anterior, las páginas de un mismo `ptr` empataban y se desempataba como FIFO, así que un bloque de más de 100 páginas daba los mismos 202 fallos que FIFO. El óptimo real son 102: 101 al crearlo y 1 en el `use`. Con `new(1,410000)`, `use(1)`, `kill(1)`, OPT queda en 610 s y los demás algoritmos en 1010 s.
- La MMU pasa `page_index` en el contexto al elegir víctima, y cada página guarda su posición en `index`.
- Un `new` de tamaño 0 crea un `ptr` sin páginas (0 s y sin fragmentación) y el PID 0 es válido. El enunciado no los excluye, y un archivo de pruebas no debería rechazarse por eso.
- Un `ptr` puede tener como máximo 100 000 páginas (400 MB). Un tamaño mayor se rechaza con un error que indica la operación, para que un valor absurdo no congele el navegador. No hay tope sobre el total de páginas.
- Mediciones: con P=100 y N=5000 cada algoritmo corre en unos 100 ms en el navegador; el parser procesa 100 000 operaciones en menos de un segundo; un bloque de 100 000 páginas tarda cerca de 1 s por paso; la animación a 2000 operaciones por segundo termina las 5000 en 2,5 s.
- Verificación: las pruebas de carga comparan la MMU contra un cálculo independiente (páginas totales, fragmentación y procesos activos) y revisan sus invariantes (marcos, direcciones de disco, reloj y métricas) después de cada operación. Cubren las nueve combinaciones de P y N, bloques de 99 a 1000 páginas y trazas aleatorias con bloques de más de 100 páginas.

### 2026-10-11 - Interfaz y mensajes de error en español

- Toda la interfaz está en español: etiquetas, botones, estados, indicadores, ayudas y el nombre del archivo descargado (`operaciones_semilla5_P10_N500.txt`).
- Los mensajes de error del motor (parser, validador, generador, escenario, MMU y algoritmos) también están en español, porque el usuario los ve en pantalla cuando un archivo tiene errores.
- Los encabezados de la tabla de la MMU (PAGE ID, PID, LOADED, L-ADDR, M-ADDR, D-ADDR, LOADED-T, MARK) y los términos RAM, V-RAM, MMU y Thrashing se dejan como en el Anexo 2 del enunciado, para que quien corrija pueda compararlos directamente.
- El código y los nombres de pruebas siguen en inglés; los comentarios, en español.
- El mensaje final de la simulación explica que la memoria quedó vacía porque todos los procesos terminaron con `kill`. Es el comportamiento esperado, pero se veía como un fallo.

### 2026-10-11 - Diseño de la interfaz

- La interfaz usa JavaScript y DOM nativos, sin dependencias. La tabla de la MMU se virtualiza a mano, porque con 5000 operaciones puede haber miles de páginas (868 con P=100 a mitad de una corrida) y solo se dibujan unas 40 filas.
- La simulación avanza con `requestAnimationFrame` y se dibuja una vez por cuadro, sin importar cuántas operaciones se ejecuten en él. La velocidad se reparte por tiempo transcurrido, con un tope de 2000 operaciones por cuadro para que una pestaña inactiva no congele la página al volver.
- La tabla y los demás elementos se arman con `createElement` y `textContent`, no con `innerHTML`, para que ningún dato del archivo del usuario se interprete como HTML.
- Los errores no se silencian: un archivo inválido o un error durante la simulación se muestran en pantalla con el mensaje del motor y también en la consola.
- La simulación arranca corriendo a 10 operaciones por segundo. "Run to end" y "Step" pausan antes de actuar.
- La columna MARK muestra el bit de referencia solo con SC y `-` en los demás, como se decidió antes. Las páginas en disco se muestran atenuadas en la tabla.
- La V-RAM se muestra como porcentaje de la RAM, por lo que puede pasar de 100 %, como en el ejemplo del enunciado (125 %).
- Se agregaron hits y fallos a los indicadores. El enunciado no los pide, pero ayudan a comparar algoritmos en el informe.
- Los parámetros de la URL permiten repetir un escenario y tomar capturas sin pasar por el formulario.
- Se probó en Firefox: la carga máxima (P=100, N=5000) corre completa, la descarga coincide con lo que produce el generador, un archivo inválido muestra el error de la operación exacta y con el Anexo 1 ambas MMU terminan en 28 s.

### 2026-10-11 - Parámetros del generador

- El enunciado solo da reglas de validez; los tamaños y la frecuencia de cada operación son decisión propia.
- Se genera exactamente N operaciones, contando los P `kill`. El enunciado dice que la suma "no supere N", pero así N=5000 siempre pide una simulación de 5000 operaciones.
- Reparto de operaciones, cuando el proceso ya tiene `ptr` vivos: 15 % `new`, 70 % `use` y 15 % `delete`. Sin `ptr` vivos solo hace `new`.
- Tamaños: 80 % de hasta 1 página, 15 % de 2 a 10 páginas y 5 % de 11 a 50 páginas. Nunca se acerca a las 100 páginas, así el autodesalojo solo aparece con archivos externos.
- Los bloques de varias páginas son los que llenan la RAM y fuerzan reemplazos. Con solo bloques pequeños apenas hay desalojos.
- Se probaron tres repartos con las nueve combinaciones de P y N. Con 30 % `new` y 10 % `delete` la V-RAM llegó a miles de por ciento y el thrashing a 76 %-99 % en todos los algoritmos. Con 15/70/15 los algoritmos se distinguen (P=10, N=500: OPT 63 % contra FIFO 79 %).
- Consecuencia inherente al enunciado: toda página nueva cuenta como fallo de 5 s, por eso el thrashing nunca baja de 60 % con P=50 o 100. Cada proceso necesita al menos un `new`, y con N=500 y P=100 solo hay 5 operaciones por proceso.
- Una descripción de estos valores va en el informe, junto con el desempate de LFU.

### 2026-10-10 - Reglas de SC, LRU y OPT

- SC: una página entra a RAM con `ref_bit` en 1, porque cargar cuenta como un acceso (igual que `freq` en 1 en LFU). Todo acceso lo pone en 1.
- SC lleva una cola propia y no modifica `loaded_at`, para que LOADED-T siga mostrando el instante real de carga. Al salir de RAM la página deja la cola y su bit vuelve a 0.
- SC lanza un error explícito si su cola no coincide con las páginas en RAM, en vez de decidir con datos inconsistentes.
- Consecuencia: con todas las páginas recién cargadas (bit 1), el primer desalojo de SC se comporta como FIFO. Se diferencia cuando hay accesos entre desalojos.
- LRU usa un contador de accesos propio y no el reloj, porque un `new` de varias páginas avanza el reloj de a 5 s pero un contador nunca empata.
- OPT mide la distancia por página (ver la entrada de la Fase 6). Todo empate se resuelve como FIFO.
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
