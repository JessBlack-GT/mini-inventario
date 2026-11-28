# Bitácora — Día 9: Docker

- **Fecha:** 2026-11-25
- **Rama:** `dia-09-docker`
- **Asistente:** Claude Code

En esta bitácora no se registran secretos ni el contenido de `.env`.

## Prompt del profesor

> Crea un Dockerfile para Mini Inventario y un .dockerignore que excluya .env, node_modules, tests y entregas.
> La app debe escuchar en 0.0.0.0 y en process.env.PORT. No copies secretos a la imagen. Explícame cada instrucción.

Archivos resultantes:

- `Dockerfile` (nuevo).
- `.dockerignore` (nuevo).
- `src/healthcheck.js` (nuevo): script que usa el `HEALTHCHECK` del Dockerfile.
- `src/server.js` (modificado): escucha en `0.0.0.0` y en `process.env.PORT`.
  Después se le añadió un cierre ordenado ante SIGTERM y SIGINT (ver «Incidente: `docker stop` terminó con código 137»).

Para evitar errores de visualización, los tres archivos nuevos se escribieron primero en el scratchpad de Claude Code.
Allí se verificaron (números de línea, `node --check` y un script que comprueba cada instrucción del Dockerfile)
y después se copiaron al repositorio, comprobando que el SHA-256 coincidiera.

## Explicación del Dockerfile

```dockerfile
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
USER node
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "src/healthcheck.js"]
CMD ["node", "src/server.js"]
```

El archivo del repositorio contiene además comentarios explicativos. Aquí se muestran solo las instrucciones.

| Instrucción | Qué hace y por qué |
|---|---|
| `FROM node:22-alpine` | Parte de la imagen oficial de Node.js 22, la versión que indican `CLAUDE.md` y el CI, sobre Alpine Linux, que es pequeña. Las dependencias son JavaScript puro, así que Alpine es suficiente. |
| `ENV NODE_ENV=production` | Pone a Express y npm en modo producción. |
| `WORKDIR /app` | Crea `/app` y lo usa como carpeta de trabajo para el resto de instrucciones. |
| `COPY package.json package-lock.json ./` | Copia primero solo los manifiestos. Si no cambian, Docker reutiliza la capa de `npm ci` aunque cambie el código, y la construcción es más rápida. |
| `RUN npm ci --omit=dev && npm cache clean --force` | Instala exactamente las versiones de `package-lock.json`, sin las dependencias de desarrollo (Playwright). Después borra la caché de npm para reducir la imagen. |
| `COPY src ./src` | Copia el servidor (`server.js`) y el script del healthcheck. |
| `COPY public ./public` | Copia la interfaz web (HTML, CSS, JavaScript e icono). |
| `USER node` | Ejecuta la aplicación con el usuario sin privilegios de la imagen oficial, no como root. El código pertenece a root, así que el proceso no puede modificarlo. |
| `ENV PORT=3000` | Valor por defecto de `process.env.PORT`. Se puede cambiar al ejecutar, con `-e PORT=...`. |
| `EXPOSE 3000` | Documenta el puerto en el que escucha la app. No lo publica: eso lo hace `-p 3000:3000` en `docker run`. |
| `HEALTHCHECK ... CMD ["node", "src/healthcheck.js"]` | Cada 30 s, Docker ejecuta `src/healthcheck.js`, que consulta `/health` en el puerto de `process.env.PORT`. Espera hasta 5 s por respuesta, da 10 s de margen al arrancar y marca el contenedor como `unhealthy` tras 3 fallos seguidos. |
| `CMD ["node", "src/server.js"]` | Arranca el servidor directamente con `node`, sin npm ni un shell intermedio. Con esta forma (exec), la señal SIGTERM de `docker stop` llega directamente a `node`. Para que la app la atienda, `src/server.js` necesita un manejador de SIGTERM: sin él, `node`, que es el proceso 1 del contenedor, la ignora. Ver «Incidente: `docker stop` terminó con código 137». |

### Cómo se cumplen los requisitos del prompt

- **Escuchar en `0.0.0.0`:** `src/server.js` ahora llama a `app.listen(puerto, '0.0.0.0', ...)`.
  Dentro de un contenedor, `0.0.0.0` permite recibir las conexiones que llegan por el mapeo de puertos de Docker.
- **Escuchar en `process.env.PORT`:** `src/server.js` usa `Number(process.env.PORT) || 3000`.
  El Dockerfile fija 3000 por defecto y `docker run -e PORT=3000` lo indica explícitamente.
- **Sin secretos en la imagen:** el Dockerfile copia solo `package.json`, `package-lock.json`, `src/` y `public/`,
  nunca `COPY . .`. Así `.env` no puede entrar en la imagen aunque fallara el `.dockerignore`.
  `SUPABASE_URL` y `SUPABASE_KEY` llegan solo al ejecutar el contenedor, mediante `--env-file .env`.

### `src/healthcheck.js`

El `HEALTHCHECK` usa un archivo propio en lugar de un `node -e` con JavaScript entre comillas,
que es frágil y difícil de revisar.
El script lee `process.env.PORT` (3000 por defecto) y consulta `http://127.0.0.1:<puerto>/health` con un límite de 4 s.
Sale con código 0 si la respuesta es 2xx y con 1 en cualquier otro caso.
Usa `fetch`, incluido en Node.js 22, y `await` de nivel superior, posible porque el paquete es `"type": "module"`.

## Explicación de `.dockerignore`

El `.dockerignore` indica qué archivos no se envían a Docker como contexto de construcción.
Así ni siquiera están disponibles para un `COPY`, y la construcción es más rápida.

| Grupo | Entradas | Por qué se excluye |
|---|---|---|
| Secretos y configuración local | `.env`, `.env.*`, `**/.env`, `.mcp.json`, `.claude/` | Contienen o pueden contener credenciales y datos del proyecto. `**/.env` cubre también `mcp-inventario/.env`. La regla `.env.*` deja fuera incluso `.env.example`, que la imagen no necesita. |
| Dependencias | `node_modules/`, `**/node_modules/` | Se instalan dentro de la imagen con `npm ci`. Las de Windows podrían no servir en Linux y harían el contexto mucho más pesado. |
| Pruebas | `tests/`, `test/`, `test-results/`, `playwright-report/`, `.playwright-cli/`, `playwright.config.js` | Las pruebas unitarias y E2E y sus resultados no se usan en ejecución. Los resultados podrían contener datos de la cuenta de pruebas. |
| Entregas y documentación | `entregas/`, `docs/` | Bitácoras, capturas y documentos de la práctica, que la app no necesita. |
| Componentes que la app web no usa | `mcp-inventario/`, `scripts/`, `supabase/`, `.github/`, `skills-lock.json` | Servidor MCP en Python, script de verificación del CI, esquema SQL, workflows y registro de skills. |
| Git, editores y sistema | `.git/`, `.gitignore`, `.vscode/`, `.idea/`, `*.log`, `.DS_Store`, `Thumbs.db` | Historial de Git, configuración de editores y archivos del sistema operativo. |
| Archivos de Docker | `Dockerfile`, `.dockerignore` | La imagen no necesita contenerlos. Docker los lee igualmente para construir. |

Efecto comprobado: en `docker build` el contexto enviado fue de 74.67 kB (ver la sección siguiente).

## Construcción de la imagen

1. Verificación del Dockerfile sin construir la imagen:

   ```powershell
   docker build --check .
   ```

   Resultado: `Check complete, no warnings found.`

2. Primer comando del profesor:

   ```powershell
   docker build -t mini-inventario .
   ```

   Resultado: construcción exitosa (`naming to docker.io/library/mini-inventario:latest done`).

   - Contexto enviado a Docker: 74.67 kB. El `.dockerignore` dejó fuera `node_modules`, `.git`, `.env`, pruebas y entregas.
   - `npm ci --omit=dev`: 77 paquetes instalados, 0 vulnerabilidades.
   - Avisos sin efecto: `npm warn using --force Recommended protections disabled.` (lo provoca `npm cache clean --force`) y el aviso de una nueva versión de npm.
   - Imagen resultante: `mini-inventario:latest`, ID `e765f179c9de`.

## Incidente original: puerto 3000 ocupado al ejecutar `docker run`

### Error

Comando original del profesor:

```
docker run --env-file .env -e PORT=3000 -p 3000:3000 mini-inventario
```

La primera ejecución terminó con **código de salida 125** y Docker no llegó a arrancar la aplicación:

```
docker: Error response from daemon: ports are not available: exposing port TCP 0.0.0.0:3000 -> 127.0.0.1:0: listen tcp 0.0.0.0:3000: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.
```

El problema no estaba en la imagen ni en el Dockerfile.
Docker no pudo publicar el puerto 3000 de Windows porque otro proceso ya lo estaba usando.

### Causa

Mini Inventario seguía ejecutándose localmente (`node src/server.js`) para ver la página web en el navegador.

### Diagnóstico

Antes de detener nada, se identificó qué ocupaba el puerto. Los tres comandos son de solo lectura.

1. Proceso que escuchaba en el puerto 3000:

   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess | Select-Object Id, ProcessName }
   ```

   Resultado: PID `41988`, proceso `node`.

2. Contenedores creados a partir de la imagen:

   ```powershell
   docker ps -a --filter ancestor=mini-inventario
   ```

   Resultado: contenedor `great_mclaren` (ID `d83f8b79407a`) en estado `Created`, generado por el intento fallido.
   No ocupaba el puerto y **no se eliminó**.

3. Línea de comandos del proceso 41988:

   ```powershell
   Get-CimInstance Win32_Process -Filter "ProcessId = 41988" | Select-Object ProcessId, CommandLine | Format-List
   ```

   Resultado: `node  src/server.js`, el servidor local de Mini Inventario (lo que ejecuta `npm start`).

### Decisión: no detener procesos sin identificarlos

Antes de detener el proceso se comprobaron su PID, su nombre y su línea de comandos,
para no cerrar un proceso ajeno o que se estuviera usando.
Detenerlo se hizo solo con autorización explícita.

### Intento de detener el proceso

```powershell
Stop-Process -Id 41988 -Confirm:$false
```

El comando **falló**:

```
Stop-Process: No se encuentra ningún proceso con el identificador de proceso 41988.
```

El proceso ya había terminado antes de este paso.
`Stop-Process` **no** lo detuvo ni liberó el puerto.

### Verificación del puerto

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
```

No devolvió ninguna conexión: el puerto 3000 estaba libre.
El código de salida 1 es lo esperado cuando el cmdlet no encuentra conexiones.

### Hechos comprobados e hipótesis

**Comprobado con la salida de un comando:**

- `docker run` terminó con código 125 porque el puerto 3000 estaba ocupado.
- El proceso que escuchaba en el puerto era `node src/server.js`, con PID 41988.
- El intento fallido dejó el contenedor `great_mclaren` (`d83f8b79407a`) en estado `Created`.
- `Stop-Process -Id 41988` falló porque el proceso ya no existía.
- Después, ningún proceso escuchaba en el puerto 3000.

**Confirmado por la persona, sin salida de comando:**

- Mini Inventario estaba ejecutándose localmente para ver la página web.

**No comprobado:**

- Cómo y cuándo terminó el proceso 41988 entre el diagnóstico y el intento de detenerlo.
  En la sesión no se ejecutó ningún comando que lo cerrara.

## Reproducción controlada del conflicto

Para documentar el diagnóstico y la solución completos, la persona volvió a iniciar Mini Inventario
con `npm start` en otra terminal y se repitió el procedimiento.

1. Proceso que escuchaba en el puerto 3000 (solo lectura):

   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess | Select-Object Id, ProcessName }
   ```

   ```
      Id ProcessName
      -- -----------
   44972 node
   ```

2. Línea de comandos del PID 44972 (solo lectura):

   ```powershell
   Get-CimInstance Win32_Process -Filter "ProcessId = 44972" | Select-Object ProcessId, CommandLine | Format-List
   ```

   ```
   ProcessId   : 44972
   CommandLine : node  src/server.js
   ```

3. Con el PID y la línea de comandos a la vista, la persona autorizó explícitamente detener el proceso 44972.

4. Justo antes de detenerlo, se repitió el comando del paso 2 para confirmar que el PID seguía siendo el servidor esperado:

   ```
   ProcessId   : 44972
   CommandLine : node  src/server.js
   ```

5. Detención del proceso:

   ```powershell
   Stop-Process -Id 44972 -Confirm:$false
   ```

   El comando terminó sin errores ni salida (código 0).

6. Verificación del puerto:

   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
   ```

   No devolvió ninguna conexión (código de salida 1, el esperado sin resultados): el puerto 3000 quedó libre.

7. Verificación adicional de que el proceso ya no existía:

   ```powershell
   Get-Process -Id 44972 -ErrorAction SilentlyContinue
   ```

   No devolvió ningún proceso (código de salida 1, el esperado si el proceso no existe).

### Resultado

En la reproducción controlada, `Stop-Process` **sí** detuvo el proceso 44972 (`node src/server.js`).
Esto quedó comprobado porque el proceso existía justo antes de detenerlo (paso 4)
y ya no existía después (paso 7), y porque el puerto 3000 quedó libre (paso 6).

### Diferencia con el incidente original

| | Incidente original | Reproducción controlada |
|---|---|---|
| PID | 41988 | 44972 |
| Línea de comandos | `node  src/server.js` | `node  src/server.js` |
| Verificado justo antes de detener | No | Sí |
| Resultado de `Stop-Process` | Falló: el proceso ya no existía | Sin errores (código 0) |
| ¿Quién liberó el puerto? | No comprobado; no fue `Stop-Process` | `Stop-Process` |
| Puerto 3000 al final | Libre | Libre |

## Ejecución exitosa del contenedor

Con el puerto 3000 libre y con autorización, se repitió sin modificar el comando original del profesor.
Se lanzó en segundo plano dentro de la sesión de Claude Code:

```
docker run --env-file .env -e PORT=3000 -p 3000:3000 mini-inventario
```

### Mensaje de arranque

```
No se encontró .env; copia .env.example y completa los valores.
Mini Inventario escuchando en http://0.0.0.0:3000
```

El aviso sobre `.env` es el esperado. `src/server.js` busca un archivo `.env` dentro del contenedor y no lo encuentra,
porque el `.dockerignore` lo excluye y el Dockerfile no lo copia a la imagen.
Las variables llegaron al contenedor en tiempo de ejecución mediante `--env-file .env`,
como confirma que `/config.js` responda correctamente (ver más abajo).

### Estado del contenedor

```powershell
docker ps --filter ancestor=mini-inventario
```

| Campo | Valor |
|---|---|
| Contenedor | `sweet_morse` (ID `518e5956301f`) |
| Estado | `Up 7 seconds (healthy)` |
| Puertos | `0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp` |

El estado `healthy` indica que el `HEALTHCHECK` del Dockerfile (`node src/healthcheck.js`) recibió respuesta de `/health`.
El puerto 3000 del contenedor quedó publicado en el puerto 3000 de Windows, por IPv4 e IPv6.

### Respuestas HTTP

Comando ejecutado. Muestra solo códigos HTTP y valores `True`/`False`, nunca el contenido de `/config.js`:

```powershell
$r = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing; "health_status:$($r.StatusCode) cuerpo:$($r.Content)"; $c = Invoke-WebRequest -Uri "http://localhost:3000/config.js" -UseBasicParsing -SkipHttpErrorCheck; "config_status:$($c.StatusCode) config_completa:$($c.Content -match 'export const SUPABASE_URL' -and $c.Content -match 'export const SUPABASE_KEY')"; $i = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing; "index_status:$($i.StatusCode)"
```

Resultado:

```
health_status:200 cuerpo:{"status":"ok"}
config_status:200 config_completa:True
index_status:200
```

| Ruta | Código | Comprobación |
|---|---|---|
| `/health` | 200 | Cuerpo `{"status":"ok"}` |
| `/config.js` | 200 | Contiene `SUPABASE_URL` y `SUPABASE_KEY` (valores no mostrados) |
| `/` | 200 | Página principal servida |

### Cierre del cliente `docker run` por falta de memoria

Mientras la sesión estaba inactiva, Claude Code cerró el proceso del `docker run` que estaba en segundo plano,
porque el sistema se quedó casi sin memoria. No fue un fallo del comando.
Una consulta posterior con `docker ps -a --filter ancestor=mini-inventario` mostró
que el contenedor seguía activo (`sweet_morse`, `Up 2 hours (healthy)`):
solo se había cerrado el cliente adjunto, no el contenedor.

## Incidente: `docker stop` terminó con código 137

### Error

Con autorización, se detuvo el contenedor `sweet_morse`:

```powershell
docker stop 518e5956301f
```

El comando devolvió el ID (`518e5956301f`), pero la consulta posterior mostró que Docker había forzado el cierre
(se reproduce solo la fila de `sweet_morse`):

```powershell
docker ps -a --filter ancestor=mini-inventario
```

```
518e5956301f   mini-inventario   "docker-entrypoint.s…"   2 hours ago   Exited (137) About a minute ago             sweet_morse
```

El código 137 es 128 + 9, la señal SIGKILL.
`docker stop` envía primero SIGTERM, espera 10 s y, si el proceso sigue activo, lo termina con SIGKILL.

### Causa

En el contenedor, `node src/server.js` es el proceso 1.
El sistema no aplica a ese proceso la acción por defecto de SIGTERM (terminar), así que, sin un manejador, la señal se ignora.
`src/server.js` no tenía ningún manejador de SIGTERM.

Esta causa es una explicación técnica, no una salida observada.
La respalda que, al añadir el manejador, el cierre pasó a terminar con código 0 (ver más abajo).

### Explicación incorrecta corregida

La primera versión de esta bitácora decía que `CMD ["node", "src/server.js"]` servía
«para que reciba bien las señales de parada (SIGTERM) de `docker stop`».
No era correcto tal como estaba escrito: la forma exec entrega la señal a `node`, pero la app no la atendía.
La explicación del `CMD` en la tabla del Dockerfile ya está corregida.

### Corrección: cierre ordenado en `src/server.js`

Se añadió un manejador de SIGTERM y SIGINT al bloque de arranque.
Las rutas, el puerto, el host y el resto de funcionalidades no cambiaron.

```js
  const servidor = app.listen(puerto, host, () => {
    console.log(`Mini Inventario escuchando en http://${host}:${puerto}`);
  });

  // Cierre ordenado. docker stop envía SIGTERM y Ctrl+C envía SIGINT.
  // Como proceso 1 del contenedor, node ignora SIGTERM si no hay un manejador.
  const ESPERA_MAXIMA_MS = 8000; // menos que los 10 s tras los que docker stop envía SIGKILL
  let cerrando = false;

  function cerrar(senal) {
    if (cerrando) return;
    cerrando = true;
    console.log(`${senal} recibido; cerrando Mini Inventario...`);

    const temporizador = setTimeout(() => {
      console.error(`El servidor no terminó de cerrar en ${ESPERA_MAXIMA_MS} ms; se fuerza la salida.`);
      process.exit(1);
    }, ESPERA_MAXIMA_MS);

    servidor.close((error) => {
      clearTimeout(temporizador);
      if (error) {
        console.error('Error al cerrar el servidor:', error.message);
        process.exit(1);
      }
      // Sin process.exit(): Node termina solo, con código 0, al no quedar tareas pendientes.
      console.log('Servidor cerrado correctamente.');
    });
  }

  process.on('SIGTERM', () => cerrar('SIGTERM'));
  process.on('SIGINT', () => cerrar('SIGINT'));
```

| Parte | Qué hace |
|---|---|
| `servidor.close()` | Deja de aceptar conexiones nuevas y espera a que terminen las que están en curso. |
| Cierre correcto | Se cancela el temporizador y Node termina solo con código 0, sin `process.exit()`. |
| Error al cerrar | Sale con código 1 y muestra el mensaje del error. |
| Temporizador de 8 s | Si el cierre no termina a tiempo, sale con código 1 antes del SIGKILL de los 10 s. |
| Indicador `cerrando` | Una segunda señal no vuelve a llamar a `servidor.close()`, lo que habría provocado una salida con error. |

El archivo se preparó en el scratchpad, se comprobó con `node --check` (código 0) y con `fc.exe /N`
(solo cambiaron la línea 82 y el bloque nuevo de las líneas 85 a 113)
y se copió al repositorio con el mismo SHA-256 (`3680842D…4F816E60`).

### Verificación de la corrección

1. Pruebas unitarias:

   ```powershell
   npm test
   ```

   Resultado: `tests 9`, `pass 9`, `fail 0`.

2. Nueva imagen con el `server.js` corregido:

   ```powershell
   docker build -t mini-inventario .
   ```

   Resultado: construcción exitosa. `WORKDIR`, la copia de los manifiestos y `npm ci` se reutilizaron desde la caché (`CACHED`).
   Solo se reconstruyeron `COPY src ./src` y `COPY public ./public`.

3. Ejecución con el comando literal del profesor, en segundo plano:

   ```
   docker run --env-file .env -e PORT=3000 -p 3000:3000 mini-inventario
   ```

4. Estado del contenedor:

   ```powershell
   docker ps --filter ancestor=mini-inventario
   ```

   Resultado: `dreamy_haibt` (ID `cdd70b260361`), `Up 3 minutes (healthy)`,
   puertos `0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp`.

5. Respuestas HTTP, con el mismo comando de la sección «Respuestas HTTP»:

   ```
   health_status:200 cuerpo:{"status":"ok"}
   config_status:200 config_completa:True
   index_status:200
   ```

6. Detención:

   ```powershell
   docker stop cdd70b260361
   ```

   Resultado: `cdd70b260361`. El `docker run` adjunto terminó con código 0.

7. Código de salida registrado por Docker:

   ```powershell
   docker ps -a --filter ancestor=mini-inventario
   ```

   ```
   cdd70b260361   mini-inventario   "docker-entrypoint.s…"   19 minutes ago   Exited (0) 12 minutes ago             dreamy_haibt
   ```

8. Log completo del contenedor:

   ```
   No se encontró .env; copia .env.example y completa los valores.
   Mini Inventario escuchando en http://0.0.0.0:3000
   SIGTERM recibido; cerrando Mini Inventario...
   Servidor cerrado correctamente.
   ```

   No aparece el mensaje de salida forzada: el temporizador de 8 s se canceló.

| | Antes de la corrección | Después de la corrección |
|---|---|---|
| Contenedor | `sweet_morse` (`518e5956301f`) | `dreamy_haibt` (`cdd70b260361`) |
| Resultado de `docker stop` | `Exited (137)` (SIGKILL) | `Exited (0)` |
| Log de cierre | Ninguno | `SIGTERM recibido...` y `Servidor cerrado correctamente.` |

### Contenedores tras la corrección

Después del nuevo build, `docker ps -a --filter ancestor=mini-inventario` solo mostraba `dreamy_haibt`.
Los contenedores antiguos no se habían eliminado: el filtro `ancestor` usa la imagen a la que apunta ahora la etiqueta,
y esos contenedores se crearon con la imagen anterior. Se comprobó filtrando por nombre:

```powershell
docker ps -a --filter name=sweet_morse --filter name=great_mclaren --filter name=dreamy_haibt
```

```
CONTAINER ID   IMAGE             COMMAND                  CREATED          STATUS                      PORTS     NAMES
cdd70b260361   mini-inventario   "docker-entrypoint.s…"   37 minutes ago   Exited (0) 30 minutes ago             dreamy_haibt
518e5956301f   e765f179c9de      "docker-entrypoint.s…"   4 hours ago      Exited (137) 2 hours ago              sweet_morse
d83f8b79407a   e765f179c9de      "docker-entrypoint.s…"   5 hours ago      Created                               great_mclaren
```

## Pruebas E2E con Playwright fuera de Docker

El cambio de `src/server.js` a escuchar en `0.0.0.0` (solo IPv4) podía afectar a las pruebas E2E,
que abren la app en `http://localhost:3000`: si `localhost` se resolviera primero a `::1` (IPv6),
Playwright no llegaría al servidor. Para comprobarlo se ejecutaron las pruebas fuera de Docker.

Antes de ejecutarlas se comprobó, con comandos de solo lectura, que el puerto 3000 estaba libre
y que Chromium de Playwright estaba instalado.
Con autorización (las pruebas crean y borran productos temporales `E2E-...` en la cuenta de pruebas):

```powershell
npx playwright test
```

Playwright arrancó `npm start` (`webServer` de `playwright.config.js`), esperó a que `http://localhost:3000/health` respondiera
y ejecutó las pruebas en Chromium con un solo worker:

```
Running 10 tests using 1 worker

  ✓   1 [chromium] › tests\editar-producto.spec.js:192:1 › edita nombre, SKU, cantidad y mínimo de un producto (9.2s)
  ✓   2 [chromium] › tests\editar-producto.spec.js:234:1 › rechaza una cantidad negativa al editar y no cambia el producto (3.0s)
  ✓   3 [chromium] › tests\editar-producto.spec.js:255:1 › rechaza cambiar el SKU por uno que ya existe y no cambia el producto (4.1s)
  ✓   4 [chromium] › tests\eliminar-producto.spec.js:62:1 › cancelar la confirmación no elimina el producto en móvil (170ms)
  ✓   5 [chromium] › tests\eliminar-producto.spec.js:77:1 › confirmar elimina solo el producto elegido y la lista sigue correcta al recargar (247ms)
  ✓   6 [chromium] › tests\eliminar-producto.spec.js:92:1 › si la API no devuelve una fila, la app no muestra un borrado exitoso (187ms)
  ✓   7 [chromium] › tests\inventario.spec.js:80:1 › inicia sesión con la cuenta de prueba (1.0s)
  ✓   8 [chromium] › tests\inventario.spec.js:89:1 › rechaza una contraseña incorrecta (1.0s)
  ✓   9 [chromium] › tests\inventario.spec.js:97:1 › agrega un producto (2.7s)
  ✓  10 [chromium] › tests\inventario.spec.js:112:1 › marca un producto bajo el mínimo (2.4s)

  10 passed (29.1s)
```

- **Resultado:** las 10 pruebas pasaron en Chromium, fuera de Docker, en 29.1 s.
- **`localhost`:** funcionó con el servidor escuchando en `0.0.0.0`. En este equipo queda descartado el problema con IPv6.
  El CI del pull request ejecutará las mismas pruebas en Linux.
- **Datos de prueba:** las pruebas que crean productos `E2E-...` los borran al terminar y fallan si el borrado falla.
  Como todas pasaron, la limpieza se completó. No se verificó con una consulta directa a la base.
- **Puerto 3000:** al terminar, una comprobación de solo lectura mostró `puerto_3000_ocupado:False`.
  Playwright detuvo el servidor que había arrancado.

La salida incluyó además un aviso del entorno de la terminal, sin efecto en las pruebas:
`The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.`

## Revisión del PR y pruebas automáticas

### Revisión con el subagente `revisor-pr`

Con el PR #18 abierto y el CI en verde, se revisó la rama `dia-09-docker` frente a `main` con el subagente `revisor-pr`,
en modo de solo lectura y sin acceso a `.env`, `mcp-inventario/.env` ni `.mcp.json`.

Resultado: **0 hallazgos críticos, 0 altos, 2 medios y 5 bajos**. No encontró secretos ni consultas a datos sin protección por usuario.

| Gravedad | Hallazgo |
|---|---|
| Media | El arranque y el cierre ordenado de `src/server.js` (SIGTERM, SIGINT, temporizador, error de cierre) no tienen pruebas automáticas. |
| Media | `src/healthcheck.js` no tiene pruebas. |
| Baja (5) | Segundo Ctrl+C durante el cierre, host `0.0.0.0` fijo, aviso de `.env` dentro del contenedor, etiqueta `node:22-alpine` sin fijar y `.mcp.json` sin ignorar. |

Decisión: corregir solo los dos hallazgos medios antes del merge. Los bajos quedan para un PR posterior.

Al contrastar el informe con lo comprobado en la sesión, se corrigieron dos afirmaciones:

- El informe decía que pasaron «8 pruebas E2E»: fueron **10**.
- La exposición del servidor en la red local no es nueva:
  antes, `app.listen(puerto)` sin host ya escuchaba en todas las interfaces (`::`).

### Pruebas nuevas

No se modificó el código de producción. Las pruebas lanzan `src/server.js` y `src/healthcheck.js` como procesos hijos,
porque el bloque de arranque solo se ejecuta al llamar al archivo directamente.

**`test/cierre-servidor.test.js` (7 pruebas):**

| Prueba | Comprueba |
|---|---|
| Arranca, responde `/health` y no lee el `.env` real | 200 y `{"status":"ok"}`; el log contiene `No se encontró .env` |
| SIGTERM | Código 0, log de cierre ordenado y puerto libre |
| SIGINT | Código 0 y log de cierre ordenado |
| Segunda señal durante el cierre | Se ignora: un solo `recibido`, código 0 |
| `close()` no termina (simulado) | El temporizador fuerza la salida con código 1 entre 7,5 y 10 s |
| `close()` devuelve un error (simulado) | Código 1 y `Error al cerrar el servidor: error simulado` |
| SIGTERM real del sistema operativo | Código 0 y log de cierre. **Solo fuera de Windows** |

**`test/healthcheck.test.js` (4 pruebas)**, con un servidor HTTP falso en un puerto libre:

| Prueba | Código esperado |
|---|---|
| `/health` responde 200 en el puerto de `PORT` | 0 |
| `/health` responde 503 | 1 |
| No hay servidor en el puerto | 1 |
| `/health` no responde en 4 s | 1 |

Medidas para que las pruebas sean seguras y estables:

- **Sin `.env` real:** `src/server.js` busca `.env` junto a sí mismo, no en el directorio de trabajo.
  Un módulo auxiliar cargado con `--import` desactiva `process.loadEnvFile` en el proceso hijo,
  y la primera prueba exige el aviso `No se encontró .env`.
  Además, el hijo usa un directorio temporal, un entorno sin variables `SUPABASE_*`, `TEST_*` ni `DATABASE_URL`,
  y valores ficticios (`https://ejemplo.supabase.co`, `sb_publishable_falsa`).
- **Sin datos reales:** ninguna prueba nueva llama a `/config.js` ni a Supabase.
- **Puertos:** cada prueba pide un puerto libre al sistema y nunca usa el 3000.
  No se puede usar `PORT=0` porque `Number('0') || 3000` daría 3000.
- **Procesos huérfanos:** cada hijo tiene una limpieza que lo termina con SIGKILL si sigue vivo al acabar la prueba, aunque falle.
- **Estabilidad:** no hay esperas fijas. Se espera la línea `escuchando` y el fin del proceso, con un tiempo máximo por prueba.

Señales y simulaciones:

- En Windows, `child.kill('SIGTERM')` termina el proceso sin ejecutar el manejador.
  Por eso el módulo auxiliar recibe la señal por IPC, cierra el canal y hace `process.emit(señal)`,
  que ejecuta el mismo manejador que una señal real. Funciona igual en Windows y en Linux.
- Las pruebas del temporizador y del error de cierre **simulan** el fallo:
  sustituyen `http.Server.prototype.close` solo en el proceso hijo de esa prueba.
- La prueba con SIGTERM real del sistema usa `child.kill('SIGTERM')` y se omite en Windows.

Los dos archivos se escribieron en el scratchpad, se comprobaron con `node --check` (código 0)
y se copiaron a `test/` con el mismo SHA-256.

### Resultado en Windows

```powershell
npm test
```

```
ℹ tests 20
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 9893.592
```

| Archivo | Aprobadas | Omitidas | Fallidas |
|---|---|---|---|
| `test/cierre-servidor.test.js` | 6 | 1 | 0 |
| `test/healthcheck.test.js` | 4 | 0 | 0 |
| `test/server.test.js` (existentes) | 9 | 0 | 0 |
| **Total** | **19** | **1** | **0** |

Prueba omitida, con el motivo que muestra `node --test`:

```
﹣ SIGTERM real del sistema operativo cierra de forma ordenada (solo fuera de Windows) (0.1505ms) # Windows no entrega SIGTERM al proceso: child.kill() lo termina sin ejecutar el manejador
```

**La prueba con SIGTERM real del sistema operativo sigue pendiente de comprobarse en Linux.**
Una prueba omitida no cuenta como aprobada.

Tiempos medidos: el temporizador forzó la salida a los 8270 ms y el healthcheck sin respuesta terminó a los 4085 ms.

### Cambio en el CI

El CI solo ejecutaba Playwright. Se añadió `npm test` después de `npm ci`,
para que las pruebas unitarias y de arranque se ejecuten también en Linux:

```diff
       - name: Instalar dependencias
         run: npm ci
 
+      - name: Pruebas unitarias y de arranque (node --test)
+        run: npm test
+
       - name: Instalar Chromium y sus dependencias
         run: npx playwright install --with-deps chromium
```

El paso no usa secretos y el nombre del job no cambió («Pruebas E2E (Playwright)»).
El archivo se preparó en el scratchpad y se verificó con `fc.exe /N` (un solo bloque distinto),
SHA-256 (`807E4565…0FB9E16A`) y `git diff --stat` (`3 insertions(+)`, sin líneas eliminadas).

## Lecciones

- Antes de `docker run -p 3000:3000`, comprobar que el puerto esté libre o detener el servidor local (`npm start` o `npm run dev`).
- Identificar un proceso, con su PID y su línea de comandos, antes de detenerlo.
- Volver a verificar el PID justo antes de detenerlo, porque el proceso puede haber terminado o cambiado.
- No atribuir la liberación del puerto a un comando que en realidad falló.
- Comprobar el código de salida después de `docker stop`: `Exited (137)` indica que Docker tuvo que forzar el cierre.
- En un contenedor, la app debe manejar SIGTERM por sí misma, porque como proceso 1 no se aplica la acción por defecto.
- Corregir en la documentación cualquier afirmación que una prueba demuestre incorrecta.
- Las señales reales no se pueden probar en Windows; las pruebas que dependen de ellas deben ejecutarse también en Linux.

## Estado actual

- Imagen `mini-inventario:latest`: reconstruida con el `server.js` corregido. La imagen anterior es `e765f179c9de`.
- Pruebas: 20 con `node --test` en Windows (19 aprobadas, 1 omitida, 0 fallidas; la omitida es SIGTERM real, pendiente de comprobarse en Linux) y 10 de 10 E2E de Playwright en Chromium, fuera de Docker (29.1 s).
- `docker run` del profesor: ejecutado con éxito con las dos imágenes.
- Contenedor `dreamy_haibt` (`cdd70b260361`): `Exited (0)`, detenido de forma ordenada.
- Contenedor `sweet_morse` (`518e5956301f`): `Exited (137)`, se conserva como evidencia del incidente.
- Contenedor `great_mclaren` (`d83f8b79407a`): `Created`, se conserva como evidencia del incidente del puerto.
- Ningún contenedor se ha eliminado. Borrarlos requiere aprobación previa.

## Despliegue en Render

### Primer despliegue

- Servicio web `srv-dc49lud6e07s73eivmag` (runtime Docker, plan free, rama `main`, Auto-Deploy activado con disparador `commit`).
- URL pública: https://mini-inventario-8dms.onrender.com
- Primer despliegue: `dep-dc49lul6e07s73eivn1g`, commit `0eee21e` (merge del PR #18), disparador `manual`,
  2026-11-26 20:47:54Z → 20:48:23Z, estado `live`.
- La consulta se hizo con el MCP oficial de Render (plugin `render@claude-plugins-official`), conectado por OAuth
  y usado solo con herramientas de lectura: `list_workspaces`, `get_service`, `list_deploys`, `list_events` y `list_logs`.

![Primer despliegue en Render: 0eee21e Live](evidencias/01-primer-despliegue-render.png)

### Fallo intencional (PR #19)

Para el paso 4 de la práctica se añadió a propósito una línea al `Dockerfile`, mediante una rama y un PR:

```diff
 RUN npm ci --omit=dev && npm cache clean --force
+RUN npm run no-existe
```

- Rama `dia-09-fallo-intencional`, commit `fb8a176`, trabajada en un worktree aparte
  (`mini-inventario-fallo`) para no tocar los cambios locales de la carpeta original.
- PR #19 «Día 9 — Fallo intencional de despliegue en Render», fusionado el 2026-11-26 a las 21:20:14Z como `ab2cd51`.

### Auto-Deploy no se activó con `ab2cd51`

Varios minutos después del merge, el MCP de Render no mostraba ningún despliegue, evento ni log de build nuevo.
Con `gh` se comprobó que:

| Consulta | Resultado |
|---|---|
| `gh api repos/JessBlack-GT/mini-inventario/commits/main --jq '.sha[0:7]'` | `ab2cd51` |
| `gh api "repos/JessBlack-GT/mini-inventario/deployments?sha=ab2cd51" --jq 'length'` | `0` |
| `gh api repos/JessBlack-GT/mini-inventario/commits/ab2cd51/status` | `pending`, 0 estados |

Es decir, `main` sí tenía el merge, pero Render no registró ningún despliegue para ese commit.
La causa no se pudo determinar con el MCP ni con `gh`, y no se modificó ninguna configuración.

El commit `ab2cd51` se desplegó después manualmente desde el Dashboard de Render (disparador `manual`), dos veces:

| Despliegue | Inicio → fin (UTC) | Estado |
|---|---|---|
| `dep-dc4h3lnf3r2c73bcf980` | 2026-11-27 05:15:02 → 05:15:13 | `build_failed` |
| `dep-dc512rnf3r2c73d3pblg` | 2026-11-27 23:25:34 → 23:25:44 | `build_failed` |

![Despliegue fallido de ab2cd51 en Render](evidencias/02-despliegue-fallido-render.png)

### Diagnóstico con el MCP de Render

Prompt del profesor utilizado para el diagnóstico:

> Usa el MCP de Render para listar el último despliegue de mi servicio y leer sus logs. Explícame la causa exacta de la falla y qué línea la provocó. No cambies variables ni lances despliegues sin preguntarme.

`list_deploys` mostró como último despliegue `dep-dc512rnf3r2c73d3pblg` (build `bld-dc512rnf3r2c73d3pbn0`).
Los eventos `build_ended` y `deploy_ended` indicaron `nonZeroExit: 1` y `Exited with status 1`.
Fragmento del log de build obtenido con `list_logs` (tipo `build`):

```
==> Checking out commit ab2cd516f53320e968bdb37f1d409a2231052e06 in branch main
#10 [4/7] RUN npm ci --omit=dev && npm cache clean --force
#10 CACHED
#11 [5/7] RUN npm run no-existe
#11 0.347 npm error Missing script: "no-existe"
#11 0.347 npm error To see a list of scripts, run:
#11 0.347 npm error   npm run
#11 ERROR: process "/bin/sh -c npm run no-existe" did not complete successfully: exit code: 1

Dockerfile:16
--------------------
  15 |     RUN npm ci --omit=dev && npm cache clean --force
  16 | >>> RUN npm run no-existe
  17 |
--------------------
error: failed to solve: process "/bin/sh -c npm run no-existe" did not complete successfully: exit code: 1
```

Causa exacta:

1. La línea 16 del `Dockerfile`, `RUN npm run no-existe`, ejecuta un script que no existe en `package.json`.
2. npm responde `Missing script: "no-existe"` y termina con código 1.
3. Docker aborta el build en cuanto un `RUN` termina con un código distinto de 0: se detuvo en el paso 5 de 7,
   sin copiar `src/` ni `public/` y sin generar imagen.
4. Como no hubo imagen nueva, Render no reemplazó nada: `dep-dc49lul6e07s73eivn1g` (`0eee21e`) siguió `live`.

Respuesta de Claude Code con el MCP (prompt, último despliegue y log):

![Diagnóstico con el MCP de Render: último despliegue y log](evidencias/03a-diagnostico-mcp-prompt.png)

Continuación (log completo y causa exacta):

![Diagnóstico con el MCP de Render: causa exacta](evidencias/03b-diagnostico-mcp-causa.png)

### Recuperación (PR #20)

- En el mismo worktree se actualizó `origin/main` (`0eee21e..ab2cd51`) y se creó la rama
  `dia-09-reparar-despliegue` desde `origin/main`.
- Se eliminó únicamente la línea 16:

  ```diff
   RUN npm ci --omit=dev && npm cache clean --force
  -RUN npm run no-existe
  ```

- Verificación: `git diff --stat` mostró `1 file changed, 1 deletion(-)` y `git diff 0eee21e -- Dockerfile` salió vacío,
  es decir, el `Dockerfile` volvió a ser idéntico al de la versión desplegada.
- Commit `f1547c5`, PR #20 «Día 9 — Recuperación del despliegue en Render».
- CI del PR: `Pruebas E2E (Playwright)` `pass` (45 s). Este CI no construye la imagen Docker.
- Merge: 2026-11-27 23:40:02Z, commit `d5350e8`. Las ramas `dia-09-fallo-intencional` y `dia-09-reparar-despliegue` se conservan.

### Despliegue automático de `d5350e8`

Esta vez Auto-Deploy sí se activó, 2 s después del merge:

| Campo | Valor |
|---|---|
| Despliegue | `dep-dc519ku0tbcc73dosuk0` (build `bld-dc519l60tbcc73dosukg`) |
| Disparador | `new_commit` (`manual: false`) |
| Inicio → fin (UTC) | 2026-11-27 23:40:04 → 23:40:26 |
| Estado | `live` |
| Despliegue anterior `dep-dc49lul6e07s73eivn1g` | `deactivated` a las 23:40:26Z |

Eventos: `build_started` y `deploy_started` (23:40:04Z), `build_ended` `succeeded` (23:40:14Z),
`deploy_ended` `succeeded` (23:40:26Z). Fragmento del log de build:

```
==> Checking out commit d5350e80fb30d8b5f01c7bad271464ee9fa7ebd0 in branch main
#1 transferring dockerfile: 903B done
#9  [2/6] WORKDIR /app                                       CACHED
#10 [3/6] COPY package.json package-lock.json ./             CACHED
#11 [4/6] RUN npm ci --omit=dev && npm cache clean --force   CACHED
#8  [5/6] COPY src ./src                                     CACHED
#12 [6/6] COPY public ./public                               CACHED
#14 exporting to image ... DONE 0.2s
```

El build tiene 6 pasos en lugar de 7 y el `Dockerfile` pasó de 925 B a 903 B. Todas las capas salieron de la
caché porque el `Dockerfile` es idéntico al de `0eee21e`. No hay líneas de error.

Auto-Deploy no se activó con `ab2cd51`, pero sí con `d5350e8`. Con la información disponible
(MCP de Render y API de GitHub) no se pudo determinar la causa de esa diferencia.

### Redespliegue manual posterior de `d5350e8`

Después del despliegue automático, el mismo commit se volvió a desplegar manualmente desde el Dashboard.
La captura muestra:

- Despliegue `dep-dc51cfh7lnhs73a8sfsg`, «Merge pull request #20 from JessBlack-GT/dia-09-reparar-despliegue».
- Status `Deploy succeeded`, duración 27.2 s, trigger «Manually deployed by you via Dashboard», source `d5350e8`.
- Fecha: Nov 27, 2026 at 5:46:06 PM CST (23:46:06Z).
- Log: `Mini Inventario escuchando en http://0.0.0.0:10000`, `Your service is live` y
  `Available at your primary URL https://mini-inventario-8dms.onrender.com`.

Este redespliegue no lo lanzó Claude Code y no es una evidencia de Auto-Deploy; la evidencia de Auto-Deploy es
`dep-dc519ku0tbcc73dosuk0` (disparador `new_commit`), obtenida con el MCP.

![Recuperación: d5350e8 desplegado con éxito en Render](evidencias/04-recuperacion-render.png)

### Verificación de la URL pública

Una petición `GET` a https://mini-inventario-8dms.onrender.com/health el 2026-11-27 a las 23:57:37Z respondió:

```
200 {"status":"ok"}
```

La aplicación pública con la sesión iniciada (barra de direcciones `mini-inventario-8dms.onrender.com`,
botón «Cerrar sesión», formulario «Agregar producto» y lista de productos; el correo de la cuenta está tapado):

![Aplicación pública con la sesión iniciada](evidencias/05-aplicacion-sesion-iniciada.png)

### Nota sobre las pruebas adicionales y `ci.yml`

Las mejoras descritas en «Pruebas nuevas», «Cambio en el CI» y «Estado actual» **no están publicadas**:

- `test/cierre-servidor.test.js` y `test/healthcheck.test.js` se desarrollaron y se comprobaron solo en local (Windows).
- La modificación de `.github/workflows/ci.yml` que añade el paso `npm test` también quedó solo en local.
- Ninguno de esos tres cambios se incorporó a `main`: el PR #18 se fusionó en su estado publicado, sin ellos,
  y los PR #19 y #20 solo cambiaron una línea del `Dockerfile`.
- Por tanto, esas pruebas no participaron en el CI de los PR #19 y #20.

Hay que distinguir dos resultados distintos:

| Pruebas | Dónde se ejecutaron | Resultado |
|---|---|---|
| 20 pruebas con `node --test`, incluidas las dos nuevas | Solo en local, en Windows | 19 aprobadas, 1 omitida (SIGTERM real, que Windows no entrega), 0 fallidas |
| Suite E2E de Playwright (10 pruebas, las mismas que dieron 10 de 10 en local) | GitHub Actions, job `Pruebas E2E (Playwright)` | `pass` en el PR #20 (45 s) |

La prueba omitida en Windows (SIGTERM real) sigue sin comprobarse en Linux, porque el CI de `main`
no ejecuta `npm test`. En el log de GitHub Actions solo se consultó el estado del job, no el recuento de pruebas.

### Evidencias

| Evidencia | Dato |
|---|---|
| URL pública | https://mini-inventario-8dms.onrender.com |
| PR del fallo intencional | #19 → `ab2cd51` |
| Despliegues fallidos | `dep-dc4h3lnf3r2c73bcf980`, `dep-dc512rnf3r2c73d3pblg` (`build_failed`) |
| Error y línea | `npm error Missing script: "no-existe"`, `Dockerfile:16`, `exit code: 1` |
| PR de recuperación | #20 → `d5350e8`, CI `pass` |
| Despliegue de recuperación | `dep-dc519ku0tbcc73dosuk0`, `new_commit`, `live`; redespliegue manual `dep-dc51cfh7lnhs73a8sfsg` `Deploy succeeded` |
| Salud del servicio | `/health` → `200 {"status":"ok"}` |

Capturas incorporadas:

| Captura | Qué muestra |
|---|---|
| `evidencias/01-primer-despliegue-render.png` | Dashboard de Render: servicio `mini-inventario`, `0eee21e` Live, «First Deploy» |
| `evidencias/02-despliegue-fallido-render.png` | `dep-dc512rnf3r2c73d3pblg` (`ab2cd51`): `Deploy failed`, `Missing script: "no-existe"`, `Dockerfile:16` |
| `evidencias/03a-diagnostico-mcp-prompt.png` | Prompt del diagnóstico y respuesta con el último despliegue y el log |
| `evidencias/03b-diagnostico-mcp-causa.png` | Log del build y explicación de la causa exacta |
| `evidencias/04-recuperacion-render.png` | `dep-dc51cfh7lnhs73a8sfsg` (`d5350e8`): `Deploy succeeded`, servicio live en la URL pública |
| `evidencias/05-aplicacion-sesion-iniciada.png` | App en `mini-inventario-8dms.onrender.com` con la sesión iniciada; correo tapado |

La disponibilidad pública queda acreditada por la captura 05, la petición a `/health` y el log de la captura 04.

### Lecciones del despliegue

- Un fallo en el build no afecta a producción: Render mantiene la versión anterior hasta que una imagen nueva se construye bien.
- El log de build de Docker señala la línea exacta del `Dockerfile` que falló (`Dockerfile:16` con `>>>`).
- Que el CI del PR pase no garantiza que el build en Render funcione si el CI no construye la imagen Docker.
- Comprobar con lectura (MCP y `gh`) si un despliegue existe antes de suponer que falló, y no inventar la causa
  cuando los datos no la muestran.

### Estado tras el despliegue

- Render: `d5350e8` desplegado con éxito, primero por Auto-Deploy (`dep-dc519ku0tbcc73dosuk0`) y después
  por un redespliegue manual desde el Dashboard (`dep-dc51cfh7lnhs73a8sfsg`); `/health` responde 200.
- `main` en GitHub: `d5350e8`, con el `Dockerfile` sin la línea del fallo.
- Desde Claude Code no se modificaron variables de entorno ni configuraciones de Render, ni se lanzaron despliegues manuales.
