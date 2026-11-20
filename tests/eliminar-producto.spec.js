import { test, expect } from '@playwright/test';

const objetivo = { id: 'simulado-1', nombre: 'Producto de prueba', sku: 'QA-SIMULADO', cantidad: 2, minimo: 5 };
const conservar = { id: 'simulado-2', nombre: 'Producto a conservar', sku: 'NO-BORRAR', cantidad: 8, minimo: 2 };

// Reemplaza el cliente y su configuración antes de abrir la app. No usa .env,
// credenciales, ni una conexión real a Supabase. Los datos viven solo en la prueba.
async function simularInventario(page, { sinFila = false } = {}) {
  let catalogo = [objetivo, conservar];
  const solicitudes = [];
  await page.route('**/config.js', (ruta) => ruta.fulfill({
    contentType: 'text/javascript',
    body: 'export const SUPABASE_URL = "https://inventario.invalid"; export const SUPABASE_KEY = "simulada";',
  }));
  await page.route('**/vendor/supabase.js', (ruta) => ruta.fulfill({
    contentType: 'text/javascript',
    body: `window.supabase = { createClient() {
      return {
        auth: {
          getSession: async () => ({ data: { session: {} } }),
          getUser: async () => ({ data: { user: { email: 'prueba@inventario.invalid' } } }),
          onAuthStateChange() {},
        },
        from(tabla) {
          if (tabla !== 'productos') throw new Error('Tabla inesperada');
          return {
            select: () => ({ order: async () => ({ data: await fetch('/__prueba/productos').then(r => r.json()) }) }),
            delete: () => ({ eq: (campo, valor) => ({ select: (columnas) => ({
              maybeSingle: async () => ({ data: await fetch('/__prueba/productos', {
                method: 'DELETE', body: JSON.stringify({ campo, valor, columnas }),
              }).then(r => r.json()) }),
            }) }) }),
          };
        },
      };
    } };`,
  }));
  await page.route('**/__prueba/productos', async (ruta) => {
    const req = ruta.request();
    if (req.method() === 'GET') {
      return ruta.fulfill({ json: catalogo });
    }
    expect(req.method()).toBe('DELETE');
    const { campo, valor, columnas } = req.postDataJSON();
    expect(campo).toBe('id');
    expect(columnas).toBe('id');
    solicitudes.push(valor);
    const encontrado = catalogo.find((p) => p.id === valor);
    if (sinFila || !encontrado) return ruta.fulfill({ json: null });
    catalogo = catalogo.filter((p) => p.id !== valor);
    return ruta.fulfill({ json: { id: valor } });
  });
  await page.goto('/');
  await expect(page.locator('#cuerpo-tabla tr')).toHaveCount(2);
  return solicitudes;
}

function botonEliminar(page) {
  return page.getByRole('button', { name: 'Eliminar Producto de prueba (QA-SIMULADO)', exact: true });
}

test('cancelar la confirmación no elimina el producto en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const solicitudes = await simularInventario(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  let mensaje;
  page.once('dialog', async (dialogo) => {
    mensaje = dialogo.message();
    await dialogo.dismiss();
  });
  await botonEliminar(page).click();
  expect(mensaje).toContain(objetivo.sku);
  await expect(page.locator('#cuerpo-tabla tr')).toHaveCount(2);
  expect(solicitudes).toEqual([]);
});

test('confirmar elimina solo el producto elegido y la lista sigue correcta al recargar', async ({ page }) => {
  const solicitudes = await simularInventario(page);
  page.once('dialog', (dialogo) => dialogo.accept());
  await botonEliminar(page).click();
  await expect(page.locator('#aviso-lista')).toContainText('QA-SIMULADO');
  await expect(page.locator('#contador')).toHaveText('0 productos bajo mínimo');
  await expect(page.locator('#titulo-lista')).toBeFocused();
  expect(solicitudes).toEqual([objetivo.id]);

  await page.reload();
  await expect(page.locator('#cuerpo-tabla tr')).toHaveCount(1);
  await expect(page.locator('#cuerpo-tabla')).toContainText(conservar.sku);
  await expect(page.locator('#cuerpo-tabla')).not.toContainText(objetivo.sku);
});

test('si la API no devuelve una fila, la app no muestra un borrado exitoso', async ({ page }) => {
  const solicitudes = await simularInventario(page, { sinFila: true });
  page.once('dialog', (dialogo) => dialogo.accept());
  await botonEliminar(page).click();
  await expect(page.locator('#error-lista')).toHaveText('Producto no encontrado');
  await expect(page.locator('#aviso-lista')).toHaveText('');
  await expect(page.locator('#cuerpo-tabla tr')).toHaveCount(2);
  expect(solicitudes).toEqual([objetivo.id]);
});
