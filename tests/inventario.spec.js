// Pruebas de extremo a extremo de Mini Inventario.
//
// Requieren TEST_EMAIL y TEST_PASSWORD en el entorno (o en .env, que carga
// playwright.config.js). Cada prueba usa un SKU único y, al terminar, borra
// solo los productos que creó, con la misma cuenta de prueba y respetando RLS.
// No se imprime ninguna credencial ni se guarda el estado de autenticación.

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

async function iniciarSesion(page, contrasena = TEST_PASSWORD) {
  await page.goto('/');
  await expect(page.locator('#vista-acceso')).toBeVisible();
  await page.locator('#correo').fill(TEST_EMAIL);
  await page.locator('#contrasena').fill(contrasena);
  await page.locator('#boton-acceso').click();
}

async function agregarProducto(page, { nombre, sku, cantidad, minimo }) {
  await page.locator('#nombre').fill(nombre);
  await page.locator('#sku').fill(sku);
  await page.locator('#cantidad').fill(String(cantidad));
  await page.locator('#minimo').fill(String(minimo));
  await page.locator('#boton-guardar').click();
  const fila = page.locator('#cuerpo-tabla tr', { hasText: sku });
  await expect(fila).toHaveCount(1);
  return fila;
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

test('inicia sesión con la cuenta de prueba', async ({ page }) => {
  await iniciarSesion(page);

  await expect(page.locator('#vista-inventario')).toBeVisible();
  await expect(page.locator('#vista-acceso')).toBeHidden();
  await expect(page.locator('#boton-salir')).toBeVisible();
  await expect(page.locator('#error-acceso')).toHaveText('');
});

test('rechaza una contraseña incorrecta', async ({ page }) => {
  await iniciarSesion(page, 'contrasena-incorrecta-e2e');

  await expect(page.locator('#error-acceso')).toHaveText('Correo o contraseña incorrectos');
  await expect(page.locator('#vista-acceso')).toBeVisible();
  await expect(page.locator('#vista-inventario')).toBeHidden();
});

test('agrega un producto', async ({ page }) => {
  await iniciarSesion(page);
  await expect(page.locator('#vista-inventario')).toBeVisible();

  const sku = skuUnico();
  const fila = await agregarProducto(page, { nombre: 'Producto E2E', sku, cantidad: 10, minimo: 3 });

  await expect(fila).toContainText('Producto E2E');
  await expect(fila.locator('td').nth(2)).toHaveText('10');
  await expect(fila.locator('td').nth(3)).toHaveText('3');
  await expect(fila.locator('.marca')).toHaveText('Stock suficiente');
  await expect(fila).not.toHaveClass(/bajo-minimo/);
  await expect(page.locator('#formulario [data-error-de="general"]')).toHaveText('');
});

test('marca un producto bajo el mínimo', async ({ page }) => {
  await iniciarSesion(page);
  await expect(page.locator('#vista-inventario')).toBeVisible();

  const sku = skuUnico();
  const fila = await agregarProducto(page, { nombre: 'Producto E2E bajo mínimo', sku, cantidad: 2, minimo: 5 });

  await expect(fila).toHaveClass(/bajo-minimo/);
  await expect(fila.locator('.marca')).toHaveText('Bajo mínimo');
  await expect(page.locator('#contador')).toContainText('bajo mínimo');
});
