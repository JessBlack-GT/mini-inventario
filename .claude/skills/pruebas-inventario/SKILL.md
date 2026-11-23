---
name: pruebas-inventario
description: Escribe o modifica pruebas de extremo a extremo de Mini Inventario con Playwright. Úsala siempre que se pidan pruebas, tests o casos de prueba de Mini Inventario (iniciar sesión, agregar, editar, eliminar o validar productos, stock bajo mínimo), aunque no se mencione Playwright.
---

# Pruebas de Mini Inventario

Reglas para escribir pruebas de extremo a extremo de Mini Inventario. Síguelas todas; si alguna no se puede cumplir, dilo antes de escribir la prueba.

## 1. Playwright en `tests/`

- Usa `@playwright/test` (ya está en `devDependencies`) y guarda cada archivo como `tests/<funcionalidad>.spec.js`, por ejemplo `tests/editar-producto.spec.js`.
- Respeta `playwright.config.js`: `baseURL` ya apunta al servidor local, usa `page.goto('/')`. No cambies la configuración salvo que se pida.
- Usa la sintaxis de módulos ES (`import`), como el resto del proyecto.

## 2. Credenciales desde el entorno

- Lee `TEST_EMAIL`, `TEST_PASSWORD`, `SUPABASE_URL` y `SUPABASE_KEY` de `process.env`. `playwright.config.js` ya carga `.env` si existe.
- Si faltan, omite las pruebas en vez de fallar:
  ```js
  test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Faltan TEST_EMAIL o TEST_PASSWORD en el entorno');
  ```
- Nunca escribas credenciales en el código, en comentarios, en mensajes de error ni en `console.log`.
- No escribas las credenciales con `locator.fill`: Playwright titula el paso como `Fill "<valor>"` y el reporte HTML se publica como artefacto en CI. Usa un helper con `locator.evaluate`, como `rellenarSinRegistrar` en `tests/inventario.spec.js`.
- No guardes el estado de autenticación (`storageState`) en archivos.

## 3. Un SKU único por prueba

- Cada producto que cree una prueba usa un SKU nuevo y registrado para la limpieza:
  ```js
  let skusCreados = [];

  function skuUnico() {
    const sku = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    skusCreados.push(sku);
    return sku;
  }

  test.beforeEach(() => { skusCreados = []; });
  ```
- No reutilices SKU fijos ni dependas de productos que ya existan en la cuenta.

## 4. Borrar lo que se creó

- En `test.afterEach`, borra **solo** los SKU de `skusCreados`, con un cliente de Supabase que inicie sesión con la misma cuenta de prueba (respeta RLS):
  ```js
  test.afterEach(async () => {
    if (skusCreados.length === 0) return;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: errorSesion } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL, password: TEST_PASSWORD,
    });
    if (errorSesion) throw new Error(`Limpieza: no se pudo iniciar sesión (${errorSesion.code ?? errorSesion.status})`);
    const { error } = await supabase.from('productos').delete().in('sku', skusCreados);
    await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error(`Limpieza: no se pudieron borrar ${skusCreados.join(', ')} (${error.code})`);
  });
  ```
- La limpieza corre aunque la prueba falle. Nunca borres por otro criterio (todos los productos, por nombre, sin filtro).
- Si faltan `SUPABASE_URL` o `SUPABASE_KEY` y la prueba creó datos, lanza un error claro en lugar de dejarlos sin borrar.

## 5. Seleccionar por rol o etiqueta

- Usa `getByRole` y `getByLabel`, no selectores CSS por `id` o clase:
  ```js
  await page.getByLabel('Nombre').fill('Producto E2E');
  await page.getByLabel('SKU').fill(sku);
  await page.getByLabel('Cantidad', { exact: true }).fill('10');
  await page.getByLabel('Cantidad mínima').fill('3');
  await page.getByRole('button', { name: 'Agregar' }).click();
  ```
- Usa `exact: true` cuando un texto contenga a otro: «Cantidad» y «Cantidad mínima», «Contraseña» y el botón «Mostrar contraseña».
- Los botones de cada fila tienen nombre accesible con el producto: `Editar <nombre>` y `Eliminar <nombre> (<sku>)`.
- Localiza la fila de un producto por su SKU: `page.getByRole('row').filter({ hasText: sku })`.
- Para mensajes, usa los roles que ya tiene la página: `getByRole('alert')` para errores y `getByRole('status')` para avisos, acotados a su sección cuando haya varios.
- Si un elemento no tiene rol ni etiqueta accesible, dilo y propón corregir la página antes de recurrir a un selector CSS.

## 6. Caso correcto y caso de error

Cada funcionalidad probada necesita al menos:

- **Caso correcto:** la acción funciona y se comprueba el resultado visible (la fila, sus valores, la marca «Bajo mínimo» / «Stock suficiente», el contador o el aviso).
- **Caso de error:** una entrada inválida o un rechazo (campo vacío, cantidad negativa, SKU duplicado, contraseña incorrecta…). Comprueba el mensaje exacto que muestra la app y que **no** ocurrió el cambio.

Usa los mensajes reales de `public/productos.js` y `public/auth.js`; no inventes textos.

## Antes de entregar

- Explica qué cubre cada prueba y qué no.
- Distingue entre lo que se ejecutó y lo que no. No afirmes que las pruebas pasan sin haberlas corrido.
- Revisa que el archivo no contenga credenciales ni valores de `.env`.
