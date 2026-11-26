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

## Lecciones

- Antes de `docker run -p 3000:3000`, comprobar que el puerto esté libre o detener el servidor local (`npm start` o `npm run dev`).
- Identificar un proceso, con su PID y su línea de comandos, antes de detenerlo.
- Volver a verificar el PID justo antes de detenerlo, porque el proceso puede haber terminado o cambiado.
- No atribuir la liberación del puerto a un comando que en realidad falló.
- Comprobar el código de salida después de `docker stop`: `Exited (137)` indica que Docker tuvo que forzar el cierre.
- En un contenedor, la app debe manejar SIGTERM por sí misma, porque como proceso 1 no se aplica la acción por defecto.
- Corregir en la documentación cualquier afirmación que una prueba demuestre incorrecta.

## Estado actual

- Imagen `mini-inventario:latest`: reconstruida con el `server.js` corregido. La imagen anterior es `e765f179c9de`.
- Pruebas: 9 de 9 unitarias (`npm test`) y 10 de 10 E2E de Playwright en Chromium, fuera de Docker (29.1 s).
- `docker run` del profesor: ejecutado con éxito con las dos imágenes.
- Contenedor `dreamy_haibt` (`cdd70b260361`): `Exited (0)`, detenido de forma ordenada.
- Contenedor `sweet_morse` (`518e5956301f`): `Exited (137)`, se conserva como evidencia del incidente.
- Contenedor `great_mclaren` (`d83f8b79407a`): `Created`, se conserva como evidencia del incidente del puerto.
- Ningún contenedor se ha eliminado. Borrarlos requiere aprobación previa.
