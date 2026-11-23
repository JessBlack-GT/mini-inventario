# Bitácora — Día 7: pruebas de Playwright con y sin skill

- **Fecha:** 2026-11-20
- **Rama:** `dia-07-skill`
- **Asistente:** Claude Code

## Primera prueba sin skill

Paso 1 del Día 7: guardar el resultado original que generó el agente **sin** la skill `pruebas-inventario`, para compararlo después con el resultado que se obtenga usándola.

### Prompt

Copia literal:

> Escribe una prueba de Playwright para editar un producto

### Código generado

Archivo: `tests/editar-producto.spec.js` (169 líneas, SHA-256 `af641c4018d7a2496028beb13c9b4c184f314a7d5bbc350a8ea87e14211893b7`).

El código se copió desde el archivo sin cambios: no se corrigió, simplificó ni mejoró.

````js
import { test, expect } from '@playwright/test';

const objetivo = { id: 'simulado-1', nombre: 'Producto de prueba', sku: 'QA-SIMULADO', cantidad: 2, minimo: 5 };
const conservar = { id: 'simulado-2', nombre: 'Producto a conservar', sku: 'NO-TOCAR', cantidad: 8, minimo: 2 };

// Reemplaza el cliente y su configuración antes de abrir la app. No usa .env,
// credenciales, ni una conexión real a Supabase. Los datos viven solo en la prueba.
// Cada llamada del cliente simulado se registra en `solicitudes` para revisarla
// desde la prueba.
async function simularInventario(page, { sinFila = false } = {}) {
  let catalogo = [{ ...objetivo }, { ...conservar }];
  const solicitudes = [];
  await page.route('**/config.js', (ruta) => ruta.fulfill({
    contentType: 'text/javascript',
    body: 'export const SUPABASE_URL = "https://inventario.invalid"; export const SUPABASE_KEY = "simulada";',
  }));
  await page.route('**/vendor/supabase.js', (ruta) => ruta.fulfill({
    contentType: 'text/javascript',
    body: `window.supabase = { createClient() {
      const llamar = (accion, datos) => fetch('/__prueba/productos', {
        method: 'POST', body: JSON.stringify({ accion, ...datos }),
      }).then(r => r.json());
      return {
        auth: {
          getSession: async () => ({ data: { session: {} } }),
          getUser: async () => ({ data: { user: { email: 'prueba@inventario.invalid' } } }),
          onAuthStateChange() {},
        },
        from(tabla) {
          if (tabla !== 'productos') throw new Error('Tabla inesperada');
          return {
            select: (columnas) => ({
              order: async () => ({ data: await llamar('listar', { columnas }) }),
              eq: (campo, valor) => ({
                maybeSingle: async () => ({ data: await llamar('obtener', { campo, valor, columnas }) }),
              }),
            }),
            update: (cambios) => ({ eq: (campo, valor) => ({ select: (columnas) => ({
              maybeSingle: async () => ({ data: await llamar('actualizar', { cambios, campo, valor, columnas }) }),
            }) }) }),
          };
        },
      };
    } };`,
  }));
  await page.route('**/__prueba/productos', async (ruta) => {
    const { accion, campo, valor, cambios } = ruta.request().postDataJSON();
    solicitudes.push({ accion, campo, valor, cambios });
    if (accion === 'listar') return ruta.fulfill({ json: catalogo });

    const encontrado = campo === 'id' ? catalogo.find((p) => p.id === valor) : undefined;
    if (accion === 'obtener') return ruta.fulfill({ json: encontrado ?? null });
    if (accion === 'actualizar') {
      if (sinFila || !encontrado) return ruta.fulfill({ json: null });
      const actualizado = { ...encontrado, ...cambios };
      catalogo = catalogo.map((p) => (p.id === valor ? actualizado : p));
      return ruta.fulfill({ json: actualizado });
    }
    return ruta.fulfill({ status: 400, json: { error: `Acción inesperada: ${accion}` } });
  });
  await page.goto('/');
  await expect(page.locator('#cuerpo-tabla tr')).toHaveCount(2);
  return solicitudes;
}

function actualizaciones(solicitudes) {
  return solicitudes.filter((s) => s.accion === 'actualizar');
}

function filaDe(page, sku) {
  return page.locator('#cuerpo-tabla tr', { hasText: sku });
}

async function abrirEdicion(page) {
  await page.getByRole('button', { name: `Editar ${objetivo.nombre}`, exact: true }).click();
  await expect(page.locator('#titulo-formulario')).toHaveText(`Editar «${objetivo.nombre}»`);
}

test('editar un producto guarda los cambios y se mantienen al recargar', async ({ page }) => {
  const solicitudes = await simularInventario(page);
  await expect(page.locator('#contador')).toHaveText('1 producto bajo mínimo');

  await abrirEdicion(page);
  await expect(page.locator('#nombre')).toHaveValue(objetivo.nombre);
  await expect(page.locator('#nombre')).toBeFocused();
  await expect(page.locator('#sku')).toHaveValue(objetivo.sku);
  await expect(page.locator('#cantidad')).toHaveValue(String(objetivo.cantidad));
  await expect(page.locator('#minimo')).toHaveValue(String(objetivo.minimo));
  await expect(page.locator('#boton-guardar')).toHaveText('Guardar cambios');
  await expect(page.locator('#boton-cancelar')).toBeVisible();

  await page.locator('#nombre').fill('Producto editado');
  await page.locator('#cantidad').fill('9');
  await page.locator('#boton-guardar').click();

  // La fila refleja los cambios y deja de estar bajo mínimo.
  const fila = filaDe(page, objetivo.sku);
  await expect(fila.locator('td').nth(0)).toHaveText('Producto editado');
  await expect(fila.locator('td').nth(2)).toHaveText('9');
  await expect(fila.locator('td').nth(3)).toHaveText('5');
  await expect(fila.locator('.marca')).toHaveText('Stock suficiente');
  await expect(fila).not.toHaveClass(/bajo-minimo/);
  await expect(page.locator('#contador')).toHaveText('0 productos bajo mínimo');

  // El formulario vuelve al modo "Agregar".
  await expect(page.locator('#titulo-formulario')).toHaveText('Agregar producto');
  await expect(page.locator('#boton-guardar')).toHaveText('Agregar');
  await expect(page.locator('#boton-cancelar')).toBeHidden();
  await expect(page.locator('#nombre')).toHaveValue('');
  await expect(page.locator('#formulario [data-error-de="general"]')).toHaveText('');

  // Una sola actualización, del producto elegido y solo con los campos esperados.
  expect(actualizaciones(solicitudes)).toEqual([{
    accion: 'actualizar',
    campo: 'id',
    valor: objetivo.id,
    cambios: { nombre: 'Producto editado', sku: objetivo.sku, cantidad: 9, minimo: 5 },
  }]);

  await page.reload();
  await expect(page.locator('#cuerpo-tabla tr')).toHaveCount(2);
  await expect(filaDe(page, objetivo.sku).locator('td').nth(0)).toHaveText('Producto editado');
  await expect(filaDe(page, conservar.sku).locator('td').nth(0)).toHaveText(conservar.nombre);
  await expect(filaDe(page, conservar.sku).locator('td').nth(2)).toHaveText(String(conservar.cantidad));
});

test('cancelar la edición no guarda cambios', async ({ page }) => {
  const solicitudes = await simularInventario(page);

  await abrirEdicion(page);
  await page.locator('#nombre').fill('Cambio descartado');
  await page.locator('#boton-cancelar').click();

  await expect(page.locator('#titulo-formulario')).toHaveText('Agregar producto');
  await expect(page.locator('#boton-cancelar')).toBeHidden();
  await expect(page.locator('#nombre')).toHaveValue('');
  await expect(filaDe(page, objetivo.sku).locator('td').nth(0)).toHaveText(objetivo.nombre);
  expect(actualizaciones(solicitudes)).toEqual([]);
});

test('un valor inválido muestra el error y no envía la actualización', async ({ page }) => {
  const solicitudes = await simularInventario(page);

  await abrirEdicion(page);
  await page.locator('#cantidad').fill('-1');
  await page.locator('#boton-guardar').click();

  await expect(page.locator('#formulario [data-error-de="cantidad"]'))
    .toHaveText('La cantidad debe ser un número entero mayor o igual a 0');
  await expect(page.locator('#cantidad')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#cantidad')).toBeFocused();
  // Sigue en modo edición para poder corregir.
  await expect(page.locator('#titulo-formulario')).toHaveText(`Editar «${objetivo.nombre}»`);
  await expect(filaDe(page, objetivo.sku).locator('td').nth(2)).toHaveText(String(objetivo.cantidad));
  expect(actualizaciones(solicitudes)).toEqual([]);
});

test('si la API no devuelve una fila, la app no muestra una edición exitosa', async ({ page }) => {
  const solicitudes = await simularInventario(page, { sinFila: true });

  await abrirEdicion(page);
  await page.locator('#nombre').fill('Producto editado');
  await page.locator('#boton-guardar').click();

  await expect(page.locator('#formulario [data-error-de="general"]')).toHaveText('Producto no encontrado');
  await expect(page.locator('#titulo-formulario')).toHaveText(`Editar «${objetivo.nombre}»`);
  await expect(filaDe(page, objetivo.sku).locator('td').nth(0)).toHaveText(objetivo.nombre);
  expect(actualizaciones(solicitudes)).toHaveLength(1);
});
````

### Pruebas que contiene

| # | Prueba | Qué comprueba |
|---|---|---|
| 1 | `editar un producto guarda los cambios y se mantienen al recargar` | Al pulsar «Editar», el formulario se llena con los datos del producto, el foco queda en «Nombre» y aparecen «Guardar cambios» y «Cancelar edición». Al cambiar el nombre y la cantidad (2 → 9), la fila se actualiza, deja de estar bajo mínimo y el contador pasa a `0 productos bajo mínimo`. El formulario vuelve a «Agregar producto». Se envía una sola actualización, con `id` del producto elegido y solo `nombre`, `sku`, `cantidad` y `minimo`, con los números ya convertidos. Al recargar, el cambio sigue ahí y el otro producto no cambia. |
| 2 | `cancelar la edición no guarda cambios` | Al modificar el nombre y pulsar «Cancelar edición», el formulario se limpia, la fila conserva el nombre original y no se envía ninguna actualización. |
| 3 | `un valor inválido muestra el error y no envía la actualización` | Con cantidad `-1`, aparece el mensaje de validación en el campo, que queda con `aria-invalid="true"` y con el foco. El formulario sigue en modo edición, la fila no cambia y no se envía ninguna actualización. |
| 4 | `si la API no devuelve una fila, la app no muestra una edición exitosa` | Si la actualización no devuelve ninguna fila (producto inexistente u oculto por RLS), se muestra `Producto no encontrado`, el formulario sigue en modo edición y la fila no cambia. |

### Decisiones que tomó el agente

- **Siguió el patrón de `tests/eliminar-producto.spec.js`:** simula `config.js` y `vendor/supabase.js` con `page.route`. No usa `.env`, credenciales, la cuenta de prueba ni una conexión real a Supabase. Los datos viven solo en la prueba.
- **Mantuvo los datos en el lado de la prueba:** el cliente simulado del navegador manda cada llamada (`listar`, `obtener`, `actualizar`) a la ruta falsa `/__prueba/productos`, y un manejador de Playwright responde desde un catálogo en memoria. Así los cambios persisten al recargar y la prueba puede revisar qué se envió.
- **Registró las solicitudes y las revisó en el cuerpo de la prueba** en lugar de usar `expect` dentro del manejador de la ruta, como hace la prueba de eliminación.
- **Simuló solo las cadenas de llamadas que usa `public/productos.js`:** `select().order()`, `select().eq().maybeSingle()` y `update().eq().select().maybeSingle()`.
- **Usó `locator.fill`** para los campos del producto, porque los valores son ficticios. Para credenciales, el proyecto usa `rellenarSinRegistrar`.
- **Usó un producto bajo mínimo (2 < 5)** como objetivo, para comprobar también que la marca y el contador cambian después de editar.
- **No creó una rama nueva ni hizo commit.** El archivo se creó en la rama actual `dia-07-skill`.

### Posibles limitaciones

- **El cliente simulado depende de la forma exacta de las llamadas en `productos.js`.** Si se cambia el orden o el tipo de los métodos (por ejemplo, `.single()` en lugar de `.maybeSingle()`), la prueba fallará aunque la app funcione.
- **No usa la base de datos real:** no comprueba RLS, el índice único de SKU ni los `check` de Postgres.
- **Algunos casos quedan sin cubrir:** SKU duplicado (`23505` → «El SKU ya existe»), sesión expirada, error de red, producto no encontrado al pulsar «Editar» (`obtenerProducto`), nombre o SKU vacíos y edición en viewport móvil.
- **No verifica las columnas** que se piden en `select` (`columnas` se envía, pero no se registra ni se comprueba).
- **Repite el cliente simulado** de `eliminar-producto.spec.js` en lugar de compartirlo en un helper o fixture.
- **Depende de detalles de presentación:** textos exactos en español y posición de las columnas (`td` `nth(0)`, `nth(2)`, `nth(3)`). Un cambio de redacción o de orden de columnas la rompería.
- **Simula `getSession` con una sesión vacía (`{}`),** igual que la prueba de eliminación. No representa una sesión real.

### Qué se comprobó y qué falta

**Comprobado:**

- El archivo `tests/editar-producto.spec.js` existe y tiene 169 líneas.
- `node --check tests/editar-producto.spec.js` no reporta errores de sintaxis. Solo comprueba la sintaxis: **no ejecuta las pruebas**.
- El bloque de código de esta bitácora es idéntico al archivo, verificado por comparación byte a byte y hash SHA-256.

**Sin ejecutar todavía:**

- **Las pruebas de Playwright no se han ejecutado.** Hubo un intento de ejecutar `npx playwright test tests/editar-producto.spec.js` y se canceló antes de correr. No se sabe si las pruebas pasan o fallan.
- No se ha revisado en CI.
- No se ha comparado con el resultado que genere la skill `pruebas-inventario`, que todavía no existe.

## Segunda prueba con skill (resultado original)

Paso 2 del Día 7: guardar el resultado original que generó el agente **con** la skill `pruebas-inventario`, antes de aplicar cualquier corrección, para compararlo con la primera prueba sin skill.

### Prompt

Copia literal:

> Escribe una prueba de Playwright para editar un producto

### Código generado

Archivo: `tests/editar-producto.spec.js` (183 líneas, SHA-256 `1816972c61f408d16aa85dd32c54ba38a0c0803f227bc0407ea1da4ba0828118`).

El código se copió desde el archivo sin cambios: no se corrigió, simplificó ni mejoró. Las correcciones A–G de la revisión todavía no se han aplicado.

````js
// Pruebas de extremo a extremo: editar un producto en Mini Inventario.
//
// Requieren TEST_EMAIL y TEST_PASSWORD en el entorno (o en .env, que carga
// playwright.config.js), y SUPABASE_URL y SUPABASE_KEY para la limpieza.
// Cada prueba usa SKU únicos y, al terminar, borra solo los productos que
// creó, con la misma cuenta de prueba y respetando RLS. No se imprime ninguna
// credencial ni se guarda el estado de autenticación.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const { TEST_EMAIL, TEST_PASSWORD, SUPABASE_URL, SUPABASE_KEY } = process.env;

test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Faltan TEST_EMAIL o TEST_PASSWORD en el entorno');

/** SKUs creados por la prueba en curso; se borran en afterEach. */
let skusCreados = [];

function skuUnico() {
  const sku = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  skusCreados.push(sku);
  return sku;
}

/**
 * Escribe un valor en un campo sin que aparezca en el reporte. locator.fill
 * titula el paso como `Fill "<valor>"`; evaluate solo aparece como "Evaluate".
 */
async function rellenarSinRegistrar(locator, valor) {
  await locator.evaluate((campo, texto) => {
    campo.focus();
    campo.value = texto;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }, valor);
}

async function iniciarSesion(page) {
  await page.goto('/');
  await rellenarSinRegistrar(page.getByLabel('Correo'), TEST_EMAIL);
  await rellenarSinRegistrar(page.getByLabel('Contraseña', { exact: true }), TEST_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

async function llenarFormulario(page, { nombre, sku, cantidad, minimo }) {
  await page.getByLabel('Nombre').fill(nombre);
  await page.getByLabel('SKU').fill(sku);
  await page.getByLabel('Cantidad', { exact: true }).fill(String(cantidad));
  await page.getByLabel('Cantidad mínima').fill(String(minimo));
}

function filaDe(page, sku) {
  return page.getByRole('row').filter({ hasText: sku });
}

async function agregarProducto(page, producto) {
  await llenarFormulario(page, producto);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(filaDe(page, producto.sku)).toHaveCount(1);
}

/** Comprueba nombre, SKU, cantidad, mínimo y estado de una fila. */
async function esperarFila(page, { nombre, sku, cantidad, minimo, estado }) {
  const celdas = filaDe(page, sku).getByRole('cell');
  await expect(celdas.nth(0)).toHaveText(nombre);
  await expect(celdas.nth(1)).toHaveText(sku);
  await expect(celdas.nth(2)).toHaveText(String(cantidad));
  await expect(celdas.nth(3)).toHaveText(String(minimo));
  await expect(celdas.nth(4)).toHaveText(estado);
}

test.beforeEach(() => {
  skusCreados = [];
});

test.afterEach(async () => {
  if (skusCreados.length === 0) return;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_KEY: no se pudieron borrar los productos de prueba');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: errorSesion } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (errorSesion) throw new Error(`Limpieza: no se pudo iniciar sesión (${errorSesion.code ?? errorSesion.status})`);

  const { error } = await supabase.from('productos').delete().in('sku', skusCreados);
  await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error(`Limpieza: no se pudieron borrar ${skusCreados.join(', ')} (${error.code})`);
});

test('edita nombre, SKU, cantidad y mínimo de un producto', async ({ page }) => {
  await iniciarSesion(page);

  const skuOriginal = skuUnico();
  const skuNuevo = skuUnico();
  await agregarProducto(page, { nombre: 'Producto E2E editar', sku: skuOriginal, cantidad: 10, minimo: 3 });

  await page.getByRole('button', { name: 'Editar Producto E2E editar', exact: true }).click();

  // El formulario pasa a modo edición con los valores actuales.
  await expect(page.getByRole('heading', { name: 'Editar «Producto E2E editar»' })).toBeVisible();
  await expect(page.getByLabel('Nombre')).toHaveValue('Producto E2E editar');
  await expect(page.getByLabel('SKU')).toHaveValue(skuOriginal);
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Cantidad mínima')).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Cancelar edición' })).toBeVisible();

  await llenarFormulario(page, { nombre: 'Producto E2E editado', sku: skuNuevo, cantidad: 2, minimo: 5 });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  // La fila muestra los valores nuevos y ahora está bajo el mínimo.
  await esperarFila(page, {
    nombre: 'Producto E2E editado', sku: skuNuevo, cantidad: 2, minimo: 5, estado: 'Bajo mínimo',
  });
  await expect(filaDe(page, skuOriginal)).toHaveCount(0);
  await expect(page.getByText(/productos? bajo mínimo/)).toBeVisible();

  // El formulario vuelve a modo agregar, sin errores.
  await expect(page.getByRole('heading', { name: 'Agregar producto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar edición' })).toBeHidden();
  await expect(page.getByLabel('Nombre')).toHaveValue('');

  // El cambio quedó guardado: sigue igual al recargar.
  await page.reload();
  await esperarFila(page, {
    nombre: 'Producto E2E editado', sku: skuNuevo, cantidad: 2, minimo: 5, estado: 'Bajo mínimo',
  });
});

test('rechaza una cantidad negativa al editar y no cambia el producto', async ({ page }) => {
  await iniciarSesion(page);

  const sku = skuUnico();
  const original = { nombre: 'Producto E2E negativo', sku, cantidad: 10, minimo: 3 };
  await agregarProducto(page, original);

  await page.getByRole('button', { name: 'Editar Producto E2E negativo', exact: true }).click();
  await page.getByLabel('Cantidad', { exact: true }).fill('-1');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByText('La cantidad debe ser un número entero mayor o igual a 0', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  // Sigue en modo edición y la fila no cambió.
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
  await esperarFila(page, { ...original, estado: 'Stock suficiente' });

  await page.reload();
  await esperarFila(page, { ...original, estado: 'Stock suficiente' });
});

test('rechaza cambiar el SKU por uno que ya existe y no cambia el producto', async ({ page }) => {
  await iniciarSesion(page);

  const skuA = skuUnico();
  const skuB = skuUnico();
  const productoA = { nombre: 'Producto E2E A', sku: skuA, cantidad: 4, minimo: 1 };
  const productoB = { nombre: 'Producto E2E B', sku: skuB, cantidad: 6, minimo: 2 };
  await agregarProducto(page, productoA);
  await agregarProducto(page, productoB);

  await page.getByRole('button', { name: 'Editar Producto E2E B', exact: true }).click();
  await page.getByLabel('SKU').fill(skuA);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByText('El SKU ya existe', { exact: true })).toBeVisible();
  await expect(page.getByLabel('SKU')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();

  // Ambos productos conservan sus datos.
  await expect(filaDe(page, skuA)).toHaveCount(1);
  await esperarFila(page, { ...productoA, estado: 'Stock suficiente' });
  await esperarFila(page, { ...productoB, estado: 'Stock suficiente' });

  await page.reload();
  await expect(filaDe(page, skuA)).toHaveCount(1);
  await esperarFila(page, { ...productoB, estado: 'Stock suficiente' });
});
````

## Segunda prueba con skill: revisión, correcciones y ejecución

Paso 3 del Día 7: revisar el resultado original con skill, corregirlo con aprobación manual en cada paso, ejecutarlo y verificar la limpieza.
El código original de la sección anterior se conserva sin cambios.

### Ejecución de Playwright

- **Comando:** `npx playwright test tests/editar-producto.spec.js --reporter=list`
- **Resultado:** 3 pruebas aprobadas, 0 fallidas, 18.8 s en total, código de salida `0`.
- **Entorno:** local, Chromium, 1 worker, reutilizando el servidor que ya estaba en marcha.
- **Archivo ejecutado:** `tests/editar-producto.spec.js` corregido, 283 líneas.
- **SHA-256:** `67674d19737cedb8b31864786e0f35ff3fe5ca4a844de97e5b2a6b5df0d3e8cd`

Salida de Playwright:

```
Running 3 tests using 1 worker

  ✓  1 [chromium] › tests\editar-producto.spec.js:192:1 › edita nombre, SKU, cantidad y mínimo de un producto (9.0s)
  ✓  2 [chromium] › tests\editar-producto.spec.js:234:1 › rechaza una cantidad negativa al editar y no cambia el producto (4.0s)
  ✓  3 [chromium] › tests\editar-producto.spec.js:255:1 › rechaza cambiar el SKU por uno que ya existe y no cambia el producto (4.5s)

  3 passed (18.8s)
```

Notas de la ejecución:

- Después del resultado, npm mostró un aviso de versión nueva, sin relación con las pruebas.
- Solo se generó `test-results/.last-run.json`: no hay trazas, capturas ni reporte HTML.
- Las credenciales no aparecen en la salida.

### Escenarios verificados

| # | Prueba | Tipo | Qué comprueba |
|---|---|---|---|
| 1 | Edita nombre, SKU, cantidad y mínimo | Correcto | Los cambios se guardan, se muestran y persisten. |
| 2 | Rechaza una cantidad negativa | Error | Muestra el mensaje de validación y la fila no cambia. |
| 3 | Rechaza un SKU duplicado | Error | El índice único rechaza el cambio y nada se modifica. |

Detalle de la prueba 1:

- La fila muestra los valores nuevos y pasa a «Bajo mínimo».
- El SKU anterior desaparece.
- El contador sube exactamente 1.
- El formulario vuelve a «Agregar producto».
- El cambio persiste al recargar.

Detalle de la prueba 2:

- Con `-1` aparece el mensaje completo:
  «La cantidad debe ser un número entero mayor o igual a 0».
- El campo queda con `aria-invalid="true"`.
- La fila no cambia antes ni después de recargar.

Detalle de la prueba 3:

- El índice único real rechaza el cambio con «El SKU ya existe».
- Los dos productos conservan sus datos antes y después de recargar.

### Verificación de la limpieza

Se comprobó después de la ejecución con un script de solo lectura, fuera del proyecto:

- Inicia sesión con la cuenta de prueba y la llave pública, así que RLS se aplica.
- Hace una única consulta de conteo en el servidor, sin descargar filas:
  `select('sku', { count: 'exact', head: true }).ilike('sku', 'E2E-%')`.
- No ejecuta `insert`, `update`, `upsert`, `delete` ni `rpc`.
- Solo muestra el conteo y el estado.

Salida del script:

```
Consulta completada: true
Productos con SKU E2E-% en la cuenta de prueba (conteo exacto): 0
Limpieza: VERIFICADA (no quedan productos E2E)
```

**Resultado:** conteo exacto `0`, así que la **limpieza queda verificada**.

Límites de esta comprobación:

- Confirma el estado de la cuenta en el momento de la consulta, no qué borró cada `afterEach`.
- Los SKU exactos no se registraron. Como todos empiezan por `E2E-`, un total de 0 implica que no quedó ninguno.

### Comparación sin skill / con skill

| Aspecto | Sin skill | Con skill |
|---|---|---|
| Datos | Supabase simulado con `page.route` | Supabase real, cuenta de prueba, RLS activo |
| Selectores | CSS por `id` y clase | `getByRole` y `getByLabel` |
| SKU | Fijos (`QA-SIMULADO`) | Únicos por prueba y registrados |
| Limpieza | No hacía falta | Borra solo los SKU registrados |
| Credenciales | No usa | Desde el entorno, sin registrarse en el reporte |
| Error de la base de datos | No se podía probar | SKU duplicado contra el índice real |
| Persistencia | Simulada en memoria | Real, al recargar |
| Ejecución | No se ejecutó | 3 de 3 aprobadas |

Cobertura de la versión sin skill que no tiene la versión con skill:

- Cancelar la edición.
- «Producto no encontrado» cuando la API no devuelve fila.
- La carga exacta enviada en el `update`.
- El foco tras editar y tras un error.

### Hallazgos después de generar la prueba

| # | Gravedad | Hallazgo | Tipo |
|---|---|---|---|
| A | Alta | «Editar» se buscaba en toda la página, no en la fila del SKU. | Código |
| B | Alta | Sin `SUPABASE_URL` o `SUPABASE_KEY` se creaban productos que no se podían borrar. | Código |
| C | Media | La comprobación del contador aceptaba cualquier número, incluido 0. | Código |
| D | Baja | Rellenaba el inicio de sesión antes de que la vista estuviera visible. | Código |
| E | Baja | Tras recargar no se comprobaban los datos del producto A. | Código |
| F | Informativa | Los errores de campo no tienen rol ni `aria-describedby`. | Página |
| G | Media | No se validaba el tipo de llave; `service_role` saltaría RLS. | Código y configuración |

Errores encontrados durante las correcciones, antes de ejecutar:

- **Expresión regular del guard de SKU.**
  - La primera versión, `/^E2E-\d+-[A-Z0-9]{6}$/`, exigía un sufijo de 6 caracteres.
  - `Math.random().toString(36).slice(2, 8)` a veces da menos; por ejemplo, `0.5` da `"I"`.
  - La limpieza habría rechazado SKU propios y dejado productos residuales.
  - Se corrigió a `/^E2E-\d{13,}-[A-Z0-9]{1,6}$/` y se comprobó con 200 000 SKU generados: ninguno rechazado.
- **Validación de llave como lista de rechazo.**
  - La primera corrección de G solo rechazaba `sb_secret_` y `service_role`.
  - Aceptaba cualquier otra llave, como un JWT `authenticated` o texto desconocido.
  - La auditoría final lo marcó como error y se reemplazó por una lista de aceptación.

### Correcciones aplicadas

Todas se aplicaron solo en `tests/editar-producto.spec.js`, con aprobación previa. Respecto al original con skill: 109 líneas agregadas y 9 eliminadas (183 → 283 líneas).

| Corrige | Cambio |
|---|---|
| A | `abrirEdicion` exige una sola fila con el SKU y pulsa «Editar» dentro de ella. |
| B | Segundo `test.skip`: sin las cuatro variables no se crea nada. |
| C | Se espera exactamente `antes + 1` en el contador, con el singular correcto. |
| D | Espera el encabezado «Iniciar sesión» antes de rellenar. |
| E | Tras recargar se comprueban todos los datos de A y B. |
| G | `esLlavePublica` solo acepta `sb_publishable_…` o JWT `anon`, antes de crear y antes de borrar. |
| Guard | `comprobarSkusDePrueba` no borra nada si algún SKU no tiene el formato de `skuUnico`. |
| Instancia | Antes de crear, la URL y la llave de `/config.js` deben coincidir con las del entorno. |
| Recorte | La limpieza usa la URL y la llave recortadas, igual que la app. |
| F | Sin cambios; queda pendiente en la página. |

### Validaciones de seguridad antes de ejecutar

Todas son de solo lectura y ninguna muestra valores de credenciales.

- **Sintaxis:** `node --check` sin errores después de cada ronda de cambios.
- **`esLlavePublica`:** 9 casos comprobados. Solo acepta publishable y `anon`.
- **`leerConfigDeApp`:** lee el formato de `src/server.js` y devuelve `null` si la app responde con su script de error.
- **Entorno:** comprobado con un script independiente, sin importar `src/server.js`.
  - Las cuatro variables están definidas en `.env`.
  - La llave es de tipo publishable.
  - La URL es válida, usa `https` y es `*.supabase.co`.
  - No hay espacios sobrantes en la URL ni en la llave.
  - `TEST_EMAIL` es distinto del correo de git.
- **Cuenta de prueba:** la persona a cargo confirmó que `TEST_EMAIL` es exclusiva de pruebas.
- **Misma instancia:** la URL y la llave de `/config.js` coinciden con las de Playwright.
- **Auditoría final de 7 puntos:** todos aprobados.
- **README:** las dos versiones originales siguen idénticas.
  - Sin skill: SHA-256 `af641c40…`.
  - Con skill: SHA-256 `1816972c…`.

### Trabajo adicional necesario

| Etapa | Sin skill | Con skill |
|---|---|---|
| Generación | 1 pasada | 1 pasada |
| Revisión y auditoría | No registradas | 4 rondas |
| Corrección del código | Ninguna | 2 rondas |
| Errores al corregir | Ninguno | 2, detectados antes de ejecutar |
| Scripts de verificación | Ninguno | 3: entorno, `/config.js` y limpieza |
| Líneas de código | 169, sin cambios | 183 → 283 |
| Ejecución | No se ejecutó | 3 de 3 aprobadas al primer intento |
| Limpieza | No aplica | Verificada, conteo exacto 0 |

Detalle de las rondas con skill:

- **Revisión y auditoría:** revisión inicial, informe A–G, auditoría final de 7 puntos y revisión de los scripts de verificación.
- **Corrección del código:** primero A–E, G y el guard de SKU; después la llave pública y la comparación con `/config.js`.
- **Scripts de verificación:** los de entorno y limpieza necesitaron versiones nuevas tras la revisión.

Conclusión:

- La skill produjo desde el inicio una base cercana a lo que necesita el proyecto: base real, limpieza acotada, selectores accesibles y credenciales protegidas.
- Aun así, no estaba lista para ejecutarse contra datos reales: tenía dos hallazgos de gravedad alta (A y B) y una verificación débil (C).
- El trabajo adicional se concentró en garantías que la skill no cubría del todo:
  - no crear datos si no se pueden borrar;
  - aceptar solo llaves públicas;
  - comprobar que la app y la limpieza usan la misma instancia;
  - no borrar SKU con otro formato.
- La versión sin skill necesitaba menos garantías porque no tocaba datos reales, pero tampoco probaba RLS, el índice único ni la persistencia real.

### Pendiente

- **F:** vincular los errores de campo con `aria-describedby` en `public/index.html`.
- Ejecutar en CI; solo se ejecutó en local.
- Repetir la ejecución para descartar resultados intermitentes; hubo una sola.
- Valorar si se recupera la cobertura de la versión sin skill.
- Valorar llevar A, B, G, el guard y la comparación con `/config.js` a la skill y a `tests/inventario.spec.js`.
- Commit y pull request, cuando se aprueben.

## Revisión del pull request con `revisor-pr`

### Subagente

- Definido en `.claude/agents/revisor-pr.md`, con las herramientas Read, Grep, Glob y Bash; no tiene Edit ni Write.
- Revisa secretos, cambios sin pruebas y consultas sin protección por usuario, y responde con una tabla de hallazgos.
- Limitación: el uso de Bash solo para lectura depende de sus instrucciones, no de un bloqueo técnico.

### Ejecución

- `dia-07-skill` y `main` estaban en el mismo commit (`df7ed72`), así que todo el cambio estaba en archivos sin seguimiento.
- El subagente revisó 58 archivos sin seguimiento con 13 llamadas a herramientas.

### Hallazgos

| # | Gravedad | Categoría | Archivo | Hallazgo | Recomendación |
|---|---|---|---|---|---|
| 1 | Baja | Consulta sin protección | `.mcp.json` | El servidor MCP de Supabase no tiene `read_only`. | No incluirlo en este PR; tratarlo aparte con `read_only=true`. |
| 2 | Baja | Secreto | `.mcp.json` | El `project_ref` queda fijo en el repositorio; no es una credencial. | Decidir en ese PR aparte si se versiona. |

No hubo hallazgos críticos, altos ni medios.

### Verificaciones de seguridad posteriores

- `.claude/settings.local.json`: ignorado por una regla global o de usuario; no está versionado.
- CI: `SUPABASE_URL`, `SUPABASE_KEY`, `TEST_EMAIL` y `TEST_PASSWORD` aparecen 2 veces cada una, siempre con `${{ secrets.* }}`.
- `.mcp.json`:
  - HTTPS y dominio oficial `mcp.supabase.com`.
  - `read_only` ausente.
  - Sin credenciales escritas en la URL, las cabeceras, las variables ni los argumentos.
  - Sin seguimiento en git; queda fuera del commit.
- Un primer intento de verificación desde la línea de comandos dio un falso «usos: 0» en CI.
  Se repitió con un script independiente, cuyas funciones auxiliares pasaron 14 casos con datos ficticios.

### El proyecto no cambió

Antes de invocar el subagente se registraron `git status`, la rama, el HEAD, `main` y el SHA-256 de 100 archivos.
Se incluyeron archivos con y sin seguimiento, y el hash de `.env`, nunca su contenido. Se compararon dos veces.

| Comprobación | Antes | Después del subagente | Después del análisis |
|---|---|---|---|
| `git status --short` | 5 entradas sin seguimiento | Idéntico | Idéntico |
| Rama, HEAD y `main` | `dia-07-skill`, `df7ed72` | Idénticos | Idénticos |
| SHA-256 de 100 archivos | Registrados | Idénticos | Idénticos |

## Pull request y CI

### Pull request

- **PR:** #14, de `dia-07-skill` hacia `main`.
- **Commit:** `50a18e8`, con 4 archivos y 1143 líneas añadidas.
- **Archivos:** la prueba, la skill `pruebas-inventario`, el subagente `revisor-pr` y esta bitácora.
- **Fuera del PR:** `.mcp.json`, `skills-lock.json` y las skills de terceros.

### Resultado del CI

- **Job:** «Pruebas E2E (Playwright)», run `44844874494`.
- **Conclusión:** success, de 00:35:49 a 00:36:40 UTC del 2026-11-21.
- **Pruebas:** 10 aprobadas, 0 fallidas, 25.8 s.
- **Verificador de secretos:** el reporte se revisó antes de subirlo y no contenía secretos.

| Paso del job | Resultado |
|---|---|
| Instalar dependencias y Chromium | Correcto |
| Ejecutar pruebas de Playwright | Correcto |
| Verificar que el reporte no contenga secretos | Correcto |
| Subir reporte de Playwright | Correcto |

| Archivo de pruebas | Aprobadas |
|---|---|
| `tests/editar-producto.spec.js` | 3 de 3 |
| `tests/eliminar-producto.spec.js` | 3 de 3 |
| `tests/inventario.spec.js` | 4 de 4 |

Las pruebas nuevas pasaron también con un servidor recién iniciado en CI, sin reutilizar uno local.
La comprobación de `/config.js` pasó en ese entorno.

### Limpieza después del CI

Se repitió la verificación de solo lectura antes revisada, con dos ajustes previos en el script:

- Un error inesperado solo muestra su tipo, nunca el mensaje ni la traza.
- El resultado aclara que el conteo está limitado por RLS.

Salida del script:

```
Consulta completada: true
Productos con SKU E2E-% visibles para la cuenta de prueba (limitado por RLS; conteo exacto): 0
Limpieza: VERIFICADA (no quedan productos E2E)
```

**Resultado:** conteo exacto `0`, así que la **limpieza queda verificada** tras la ejecución local y la del CI.

Límites de esta comprobación:

- Solo cubre los productos que RLS deja ver a la cuenta de prueba, la única que usan las pruebas.
- Confirma el estado en el momento de la consulta, no qué borró cada `afterEach`.
- Incluye los productos de `tests/inventario.spec.js`, que usa el mismo prefijo `E2E-`.

### Pendiente

- Merge del PR #14, con aprobación previa.
- Los pendientes anteriores siguen vigentes: F, repetir la ejecución y valorar la cobertura perdida.
