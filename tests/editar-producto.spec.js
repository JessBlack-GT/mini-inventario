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

// Sin las cuatro variables no se crea nada, porque no se podría limpiar.
test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'Faltan TEST_EMAIL o TEST_PASSWORD en el entorno');
test.skip(!SUPABASE_URL || !SUPABASE_KEY, 'Faltan SUPABASE_URL o SUPABASE_KEY: no se podrían borrar los productos de prueba');

/** SKUs creados por la prueba en curso; se borran en afterEach. */
let skusCreados = [];
/**
 * Formato que genera skuUnico; la limpieza no borra otra cosa. El sufijo
 * aleatorio puede tener menos de 6 caracteres (toString(36) de algunos números).
 */
const FORMATO_SKU_PRUEBA = /^E2E-\d{13,}-[A-Z0-9]{1,6}$/;

function skuUnico() {
  const sku = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  skusCreados.push(sku);
  return sku;
}

/**
 * Solo acepta llaves públicas: `sb_publishable_...` o JWT con role "anon".
 * Rechaza cualquier otra (`sb_secret_...`, `service_role`, `authenticated`,
 * texto desconocido). Mismo criterio que esLlavePublica de src/server.js,
 * copiado para no importar el servidor. Nunca muestra la llave.
 */
function esLlavePublica(llave) {
  if (typeof llave !== 'string' || llave.length === 0) return false;
  if (llave.startsWith('sb_publishable_')) return true;
  const partes = llave.split('.');
  if (partes.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))?.role === 'anon';
  } catch {
    return false;
  }
}

/**
 * Lee la URL y la llave que la app entrega al navegador en /config.js.
 * Devuelve null si la respuesta no tiene el formato esperado.
 */
function leerConfigDeApp(texto) {
  const url = texto.match(/export const SUPABASE_URL = ("[^"\n]*");/);
  const llave = texto.match(/export const SUPABASE_KEY = ("[^"\n]*");/);
  if (!url || !llave) return null;
  return { url: JSON.parse(url[1]), llave: JSON.parse(llave[1]) };
}

/** Se niega a borrar si algún SKU no tiene el formato que genera skuUnico. */
function comprobarSkusDePrueba(skus) {
  const ajenos = skus.filter((sku) => !FORMATO_SKU_PRUEBA.test(sku));
  if (ajenos.length > 0) {
    throw new Error(`Limpieza: SKU con formato inesperado, no se borra nada (${ajenos.join(', ')})`);
  }
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
  // Rellenar solo cuando la vista de acceso ya está visible.
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
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

/** Pulsa «Editar» solo dentro de la fila del SKU único de la prueba. */
async function abrirEdicion(page, { nombre, sku }) {
  const fila = filaDe(page, sku);
  await expect(fila).toHaveCount(1);
  await fila.getByRole('button', { name: `Editar ${nombre}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: `Editar «${nombre}»` })).toBeVisible();
}

/** Contador de productos bajo mínimo del encabezado. */
function contador(page) {
  return page.getByText(/^\d+ productos? bajo mínimo$/);
}

function textoContador(n) {
  return n === 1 ? '1 producto bajo mínimo' : `${n} productos bajo mínimo`;
}

async function leerContador(page) {
  await expect(contador(page)).toBeVisible();
  return Number((await contador(page).textContent()).match(/^\d+/)[0]);
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

test.beforeEach(async ({ request }) => {
  skusCreados = [];
  // Antes de crear nada: solo una llave pública garantiza que se respeta RLS.
  if (!esLlavePublica(SUPABASE_KEY.trim())) {
    throw new Error('SUPABASE_KEY no es una llave pública (sb_publishable_ o JWT anon): no se crea nada');
  }

  // La app y la limpieza deben usar la misma instancia de Supabase; si no,
  // los productos creados en la interfaz no se podrían borrar. Un servidor
  // local reutilizado (reuseExistingServer) podría tener otra configuración.
  const respuesta = await request.get('/config.js');
  if (!respuesta.ok()) {
    throw new Error(`La app no entregó /config.js (HTTP ${respuesta.status()}): no se crea nada`);
  }
  const configApp = leerConfigDeApp(await respuesta.text());
  if (!configApp) {
    throw new Error('/config.js no tiene el formato esperado: no se crea nada');
  }
  const mismaUrl = configApp.url === SUPABASE_URL.trim();
  const mismaLlave = configApp.llave === SUPABASE_KEY.trim();
  if (!mismaUrl || !mismaLlave) {
    throw new Error(
      `La app usa otra configuración de Supabase (URL coincide: ${mismaUrl}, llave coincide: ${mismaLlave}): no se crea nada`,
    );
  }
});

test.afterEach(async () => {
  if (skusCreados.length === 0) return;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_KEY: no se pudieron borrar los productos de prueba');
  }
  if (!esLlavePublica(SUPABASE_KEY.trim())) {
    throw new Error('Limpieza: SUPABASE_KEY no es una llave pública (sb_publishable_ o JWT anon); no se borra nada');
  }
  comprobarSkusDePrueba(skusCreados);
  // Mismos valores recortados que entrega la app (src/server.js usa trim()).
  const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_KEY.trim(), {
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
  const original = { nombre: 'Producto E2E editar', sku: skuOriginal, cantidad: 10, minimo: 3 };
  await agregarProducto(page, original);
  await esperarFila(page, { ...original, estado: 'Stock suficiente' });
  const bajosAntes = await leerContador(page);

  // El formulario pasa a modo edición con los valores actuales.
  await abrirEdicion(page, original);
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
  // Pasó de «Stock suficiente» a «Bajo mínimo»: exactamente uno más.
  await expect(contador(page)).toHaveText(textoContador(bajosAntes + 1));

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

  await abrirEdicion(page, original);
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

  await abrirEdicion(page, productoB);
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
  await expect(filaDe(page, skuB)).toHaveCount(1);
  await esperarFila(page, { ...productoA, estado: 'Stock suficiente' });
  await esperarFila(page, { ...productoB, estado: 'Stock suficiente' });
});
