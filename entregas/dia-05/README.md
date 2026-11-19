# Bitácora — Día 5: exploración con Playwright, desborde móvil y pruebas E2E

- **Fecha:** 2026-11-18
- **Repositorio:** https://github.com/JessBlack-GT/mini-inventario
- **Rama:** `dia-05-pruebas`
- **Asistente:** Claude Code (con `playwright-cli` 0.1.23 y `@playwright/test` 1.65.1)

## 1. Objetivo y alcance

**Objetivo:** explorar la app en el navegador, encontrar problemas visuales y de consola, corregir el que se eligiera y cubrir el flujo principal con pruebas automáticas de Playwright.

| Archivo | Contenido |
|---|---|
| `public/estilos.css` | Corrección del desborde móvil: `position: relative` en `.tabla-contenedor` |
| `playwright.config.js` | Configuración de Playwright: `webServer`, credenciales desde el entorno, trazas y capturas desactivadas |
| `tests/inventario.spec.js` | 4 pruebas E2E con limpieza por SKU exacto |
| `package.json`, `package-lock.json` | `@playwright/test` con versión fija 1.65.1 (dependencia de desarrollo) |
| `entregas/dia-05/*.png` | Capturas de antes y después |

**Manejo de credenciales:** `TEST_EMAIL` y `TEST_PASSWORD` nunca se mostraron ni se escribieron en comandos. En la exploración se usó el mecanismo de secretos de `playwright-cli` (`PLAYWRIGHT_MCP_SECRETS_FILE`), que sustituye el nombre de la variable por su valor y lo oculta en la salida. Antes se probó con un archivo de valores ficticios. Las pruebas leen las variables de `process.env`. No se guardó el estado de autenticación en ningún momento y el correo aparece tapado en todas las capturas.

## 2. Prompts clave

Copias literales de los mensajes enviados.

1. **Exploración (prompt del profesor):**
   > Arranca la app. Usa playwright-cli para abrir http://localhost:3000, iniciar sesión con TEST_EMAIL y TEST_PASSWORD de .env sin mostrarlos, y agregar un producto con cantidad menor al mínimo. Toma capturas en 1280x800 y en 390x844, y revisa los errores de consola. Guarda las capturas en entregas/dia-05/ y reporta lo que encontraste. No corrijas nada todavía.

2. **Cambio en la carga de credenciales** (se rechazó cargar `.env` con `source`):
   > Mantén el prompt original del profesor. Cambia solo cómo cargas las credenciales: no uses `. ./.env` ni `source .env`. Comprueba si mi versión de playwright-cli admite PLAYWRIGHT_MCP_SECRETS_FILE. Si lo admite, abre una sesión nueva de Playwright con esa configuración y usa TEST_EMAIL y TEST_PASSWORD como referencias, sin expandir sus valores en el comando. Si no lo admite, muéstrame otra opción antes de ejecutar.
   >
   > Continúa con la exploración solo en http://localhost:3000. No muestres los valores de .env, no guardes el estado de autenticación y no corrijas el código todavía.

3. **Prueba del mecanismo de secretos:**
   > No sigas buscando en coreBundle.js. Prueba el mecanismo de secretos de playwright-cli con un archivo temporal de valores ficticios. En localhost, verifica que la referencia rellena el campo correctamente, sin enviar el formulario. Muéstrame solo si la prueba pasó o no.
   >
   > Si funciona, muéstrame el comando para iniciar sesión con TEST_EMAIL y TEST_PASSWORD de mi .env, sin incluir sus valores ni usar source .env. Si no funciona, propón una alternativa antes de continuar. Todavía no corrijas el código.

4. **Exploración autorizada:**
   > Sí, autorizo el inicio de sesión en http://localhost:3000 con el método que comprobaste. Agrega un solo producto de prueba con un SKU único y cantidad menor al mínimo. Dime qué SKU usaste.
   >
   > Toma las capturas de 1280 × 800 y 390 × 844 en entregas/dia-05/, con el correo oculto, y reporta si hubo errores en la consola. No muestres las credenciales, no guardes el estado de autenticación y no corrijas el código todavía.

5. **Diagnóstico del desborde:**
   > Elijo corregir el desborde horizontal del inventario en móvil. A 390 × 844, la tabla se corta y toda la página se desplaza hacia los lados.
   >
   > Identifica qué elemento provoca el desborde y muéstrame el cambio mínimo antes de editar. La página debe caber dentro de los 390 px. Si la tabla necesita desplazamiento horizontal, que ocurra solo dentro de su contenedor, sin ocultar columnas ni dejar inaccesible el botón Editar. No tapes el problema con overflow-x: hidden en toda la página y no corrijas el favicon en este paso.
   >
   > Dato del antes: la captura móvil completa mide 552 px de ancho aunque la ventana era de 390 px. Como .tabla-contenedor ya tiene overflow-x: auto, comprueba si el encabezado «Acciones» con la clase .oculto causa el desborde. Prueba position: relative en el contenedor solo de forma temporal y mide de nuevo antes de editar.
   >
   > Después de la corrección, verifica con Playwright que el documento no sea más ancho que la ventana a 390 × 844 y que escritorio siga funcionando a 1280 × 800. Usa el producto QA-D05-20261118161406, que ya existe, y comprueba que siga marcado como Bajo mínimo. Guarda una captura nueva con el correo oculto como entregas/dia-05/inventario-390x844-despues.png, sin sobrescribir las originales.

6. **Aplicar la corrección:**
   > Sí, aplica únicamente position: relative a .tabla-contenedor en public/estilos.css. No cambies .oculto ni el favicon.
   >
   > Después, verifica con Playwright que a 390 × 844 el documento no sea más ancho que la ventana y que puedas llegar al botón Editar desplazando solo la tabla. Comprueba que a 1280 × 800 el inventario siga funcionando y que el producto QA-D05-20261118161406 siga marcado como «Bajo mínimo».
   >
   > Guarda la captura con el correo oculto en entregas/dia-05/inventario-390x844-despues.png, sin sobrescribir las originales. Muéstrame las mediciones y el resultado de las verificaciones. No hagas commit ni push todavía.

7. **Pruebas E2E (prompt del profesor):**
   > Escribe pruebas de Playwright en tests/ para: iniciar sesión, rechazar una contraseña incorrecta, agregar un producto y marcar un producto bajo el mínimo. Lee TEST_EMAIL y TEST_PASSWORD del entorno. Cada prueba usa un SKU único y borra lo que creó. Configura webServer para arrancar la app. Corre las pruebas y muéstrame el resultado.

8. **Ajuste de la configuración:**
   > Conserva la configuración de webServer y la lectura de TEST_EMAIL y TEST_PASSWORD desde el entorno. Antes de crear playwright.config.js, cambia trace y screenshot a 'off'. No guardes el estado de autenticación ni imprimas las credenciales. Muéstrame la configuración corregida antes de ejecutar las pruebas.

9. **Ejecución y limpieza:**
   > Sí, ejecuta npx playwright test. Autorizo borrar solo los productos nuevos que esta ejecución cree, usando sus SKU exactos. No toques QA-D05-20261118161406, PRUEBA-A ni PRUEBA-B. Muéstrame cuántas pruebas pasaron, fallaron o se omitieron, y confirma que no quedaron productos de esta ejecución. No imprimas credenciales ni hagas commit o push.

10. **Instalación de Chromium:**
    > Instala Chromium y ejecuta las pruebas solo si la instalación termina correctamente. Usa este comando sin `tail`, para conservar la salida completa:
    >
    > `npx playwright install chromium && npx playwright test`
    >
    > Si la instalación falla, muéstrame el error y no ejecutes las pruebas. Si se ejecutan, dime cuántas pasaron, fallaron o se omitieron. No hagas commit ni push.

11. **Consulta de limpieza con cierre de sesión local:**
    > Haz la misma consulta de solo lectura, pero usa `await s.auth.signOut({ scope: 'local' })` para cerrar únicamente la sesión que abre este comando. Dime si quedaron SKU con prefijo `E2E-` y si `QA-D05-20261118161406` sigue presente. No borres nada, no imprimas credenciales y no repitas las cuatro pruebas.

12. **Cierre de sesión local en las pruebas:**
    > Sí, cambia únicamente `supabase.auth.signOut()` por `supabase.auth.signOut({ scope: 'local' })` en el `afterEach` de `tests/inventario.spec.js`. Conserva la limpieza por SKU exacto y muéstrame el diff. No hagas commit ni push todavía.

13. **Prueba de regresión:**
    > Cambia temporalmente solo el operador `<` por `>` en la condición que determina si un producto está bajo el mínimo. Ejecuta `npx playwright test` y muéstrame qué pruebas fallan y por qué. Confirma que falle la prueba de «Bajo mínimo» por la condición invertida, no por un error de conexión o de inicio de sesión.
    >
    > Restaura el operador `<` aunque la ejecución falle. Después vuelve a ejecutar `npx playwright test` y muéstrame el resultado final. Borra únicamente los productos nuevos creados por estas ejecuciones, usando sus SKU exactos. Conserva el cambio de `signOut({ scope: 'local' })`. No hagas commit ni push.

## 3. Exploración inicial

Se inició sesión y se agregó el producto de prueba **`QA-D05-20261118161406`** («Producto de prueba Día 5», cantidad 2, mínimo 5).

| Captura | Descripción |
|---|---|
| [inventario-1280x800.png](inventario-1280x800.png) | Escritorio: todo correcto, fila en rojo con «Bajo mínimo» |
| [inventario-390x844.png](inventario-390x844.png) | Móvil, área visible: la tabla se corta |
| [inventario-390x844-completa.png](inventario-390x844-completa.png) | Móvil, página completa: la imagen mide 552 px de ancho |

**Hallazgos:**

1. El producto bajo mínimo se marca bien: fila en rojo, etiqueta «Bajo mínimo» y encabezado «1 producto bajo mínimo».
2. A 390 px la tabla se corta: solo se ven Nombre, SKU y Cantidad. Mínimo, Estado y Editar quedan fuera de la vista.
3. A 390 px toda la página se desborda hacia los lados: el documento mide 552 px.
4. En móvil, el nombre del producto se parte en cuatro líneas.
5. Consola: un solo error, `404 (Not Found)` en `/favicon.ico`. Queda pendiente, fuera de este paso.

## 4. Desborde móvil: de 552 a 390 px

### Diagnóstico

El encabezado oculto «Acciones» (`<span class="oculto">`) usa `position: absolute`, y ningún ancestro estaba posicionado. Por eso se ubicaba respecto al documento (`offsetParent` = `BODY`) y no dentro de `.tabla-contenedor`. El `overflow-x: auto` del contenedor no lo recortaba. El span terminaba en x = 552 y estiraba todo el documento.

Se aplicó `position: relative` al contenedor solo en el navegador, se midió y se revirtió antes de editar:

| Estado (390 × 844) | Ancho del documento | Tabla / contenedor | `offsetParent` de `.oculto` |
|---|---|---|---|
| Antes | 552 | 589 / 316 | `BODY` |
| Con `position: relative` temporal | 390 | 589 / 316 | `div.tabla-contenedor` |
| Revertido | 552 | 589 / 316 | `BODY` |

### Cambio en `public/estilos.css`

```diff
-.tabla-contenedor { overflow-x: auto; }
+.tabla-contenedor { overflow-x: auto; position: relative; }
```

No se modificó `.oculto`, no se usó `overflow-x: hidden` en la página y no se tocó el favicon.

### Verificación (16:31)

**Móvil, 390 × 844:**

- Ancho del documento: 390, igual que la ventana (antes, 552). Ancho del body: 390.
- Al intentar desplazar la página 300 px hacia un lado, el desplazamiento lateral fue 0.
- La tabla sigue midiendo 589 px dentro de un contenedor de 316 px y se desplaza solo dentro de él.
- Botón Editar: sin desplazar la tabla, su borde derecho queda en x = 618, fuera de pantalla. Tras desplazar solo la tabla 273 px, queda entre x = 278 y x = 345, dentro de la ventana, con la página en 0 px de desplazamiento lateral. La prueba de clic de Playwright confirmó que se puede pulsar.
- `QA-D05-20261118161406`: sigue marcado «Bajo mínimo», con la fila en rojo.

**Escritorio, 1280 × 800:**

- Ancho del documento: 1280. La tabla cabe completa (886 / 886).
- Se ven las seis columnas: Nombre, SKU, Cantidad, Mínimo, Estado y Acciones. Editar está visible.
- Encabezado: «1 producto bajo mínimo». `QA-D05-20261118161406` sigue marcado «Bajo mínimo».

**Consola:** 0 errores y 0 advertencias tras recargar. El 404 del favicon no apareció, seguramente porque el navegador lo tenía en caché. No está resuelto.

**Captura:** [inventario-390x844-despues.png](inventario-390x844-despues.png), con el correo tapado en negro.

**Pendiente de UX:** en móvil, Mínimo, Estado y Editar siguen fuera de la vista inicial hasta desplazar la tabla, y no hay una pista visual de que se puede desplazar.

## 5. Pruebas E2E con Playwright

**Configuración (`playwright.config.js`):**

- `webServer` arranca la app con `npm start` y espera a `/health`. Reutiliza un servidor existente fuera de CI.
- Las credenciales se leen de `process.env`. Si existe `.env`, se carga con `process.loadEnvFile`, igual que en `src/server.js`, sin reemplazar variables ya definidas.
- `trace`, `screenshot` y `video` están en `'off'`, para que `test-results/` no guarde datos de la cuenta.
- Se usa 1 worker, porque las pruebas comparten la cuenta de prueba. El viewport es 1280 × 800.
- No hay `storageState`: cada prueba inicia sesión en un navegador nuevo.

**Pruebas (`tests/inventario.spec.js`):**

| Prueba | Qué comprueba |
|---|---|
| Inicia sesión con la cuenta de prueba | Se ve el inventario y el botón Cerrar sesión, sin mensaje de error |
| Rechaza una contraseña incorrecta | Aparece «Correo o contraseña incorrectos» y el inventario sigue oculto. La contraseña falsa es fija y no se deriva de la real |
| Agrega un producto | Cantidad 10 y mínimo 3: aparece la fila con «Stock suficiente» y sin la clase `bajo-minimo` |
| Marca un producto bajo el mínimo | Cantidad 2 y mínimo 5: la fila tiene la clase `bajo-minimo`, la etiqueta «Bajo mínimo» y el contador lo refleja |

**Limpieza:** cada producto usa un SKU único (`E2E-<marca de tiempo>-<aleatorio>`). En `afterEach` se inicia sesión con `supabase-js` y se borran solo esos SKU exactos con `.in('sku', skusCreados)`. RLS solo permite borrar productos propios. La sesión de limpieza se cierra con `signOut({ scope: 'local' })` (ver «Error de la IA» más abajo).

**Ejecuciones:**

1. La primera ejecución falló antes de abrir el navegador: faltaba Chromium build 1255. No se creó ningún producto.
2. Se ejecutó `npx playwright install chromium && npx playwright test`. **4 pasaron, 0 fallaron, 0 se omitieron.**

### Comando rechazado: instalación filtrada con `tail`

Para instalar Chromium, la IA propuso primero este comando:

```bash
npx playwright install chromium 2>&1 | tail -3 && npx playwright test 2>&1 | tail -25
```

Lo rechacé. En una tubería, el código de salida es el del último comando (`tail`), que casi siempre termina bien. Si la instalación fallaba, `&&` no lo habría detectado y las pruebas habrían arrancado de todos modos. Además, `tail` recortaba la salida y podía ocultar el error. Aprobé el comando sin filtro, para que las pruebas solo corrieran si la instalación terminaba bien y la salida quedara completa:

```bash
npx playwright install chromium && npx playwright test
```

### Error de la IA: `signOut()` sin limitar el alcance

**Qué pasó:** la IA escribió el `afterEach` de `tests/inventario.spec.js` con `await supabase.auth.signOut();`. En supabase-js, `signOut()` sin argumentos usa `scope: 'global'`, que revoca **todas** las sesiones de la cuenta, no solo la que abre la limpieza. Cada prueba que creaba un producto podía cerrar cualquier otra sesión abierta de la cuenta de prueba, por ejemplo una en el navegador. La primera ejecución exitosa (4 pasaron) ya corrió con ese código.

**Cómo lo detectamos:** después de esa ejecución, la IA propuso una consulta de solo lectura para confirmar la limpieza, y esa consulta también terminaba con `signOut()` sin argumentos. Rechacé el comando y pedí `signOut({ scope: 'local' })`. Al revisarlo, la IA señaló que el `afterEach` tenía el mismo problema.

**Corrección:** se cambió únicamente esa línea, sin tocar la limpieza por SKU exacto:

```diff
   const { error } = await supabase.from('productos').delete().in('sku', skusCreados);
-  await supabase.auth.signOut();
+  await supabase.auth.signOut({ scope: 'local' });
```

**Resultado:** con `scope: 'local'` las cuatro pruebas volvieron a pasar en la ejecución final de la sección 6: **4 pasaron, 0 fallaron, 0 se omitieron**.

## 6. Prueba de regresión

En `public/productos.js` se cambió temporalmente `estaBajoMinimo`:

```diff
-  return producto.cantidad < producto.minimo;
+  return producto.cantidad > producto.minimo;
```

**Resultado con `>`: 2 pasaron, 2 fallaron, 0 se omitieron.**

- **Inicio de sesión y contraseña incorrecta: pasaron.** La conexión con Supabase y la autenticación funcionaron, así que las fallas no se debieron a eso.
- **Cantidad 10 y mínimo 3 («Agrega un producto»): falló.** Con `>`, 10 > 3 es verdadero, así que la app marcó el producto como bajo mínimo. Esperado: «Stock suficiente». Recibido: «Bajo mínimo».
- **Cantidad 2 y mínimo 5 («Marca un producto bajo el mínimo»): falló.** Con `>`, 2 > 5 es falso, así que la fila no se marcó. Esperado: la clase `bajo-minimo`. Recibido: `""`.

En los dos casos el producto se creó y su fila apareció en la tabla. Solo falló la aserción del estado, que es justo el efecto de invertir la condición.

**Restauración:** se volvió a `<`. `git diff` no muestra ningún cambio pendiente en `public/productos.js`.

**Resultado final con `<`: 4 pasaron, 0 fallaron, 0 se omitieron.**

## 7. Limpieza

El `afterEach` borró cada producto creado por su SKU exacto, también en las pruebas que fallaron. Entre ellos estaban `E2E-1795055375244-BU245F` y `E2E-1795055383884-L90N7W`, de la ejecución con `>`.

Consulta final de solo lectura, después de la regresión, cerrando solo su propia sesión:

```json
{"restantesE2E":[],"todos":["PRUEBA-B","QA-D05-20261118161406"]}
```

- No quedó ningún SKU con prefijo `E2E-`.
- `QA-D05-20261118161406` y `PRUEBA-B` siguen presentes.
- `PRUEBA-A` no aparece porque la consulta se hizo desde la cuenta B (la cuenta de prueba de `.env`). Por RLS, cada cuenta solo ve sus propios productos, y `PRUEBA-A` pertenece a la cuenta A. Que no aparezca no significa que se haya borrado: ni las pruebas ni la limpieza pueden borrar productos de otra cuenta.

## 8. Pendientes

- Favicon: `/favicon.ico` responde 404.
- Móvil: no hay una pista visual de que la tabla se puede desplazar, y los nombres largos se parten en varias líneas.
- Agregar un script de `package.json` para las pruebas E2E (por ahora, `npx playwright test`).
- Commit, push y pull request de la rama `dia-05-pruebas`.
