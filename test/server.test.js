import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { app, esLlavePublica } from '../src/server.js';

let servidor;
let base;
const entornoOriginal = { ...process.env };

before(async () => {
  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once('listening', resolve));
  base = `http://localhost:${servidor.address().port}`;
});

after(() => servidor.close());

afterEach(() => {
  process.env.SUPABASE_URL = entornoOriginal.SUPABASE_URL;
  process.env.SUPABASE_KEY = entornoOriginal.SUPABASE_KEY;
  if (entornoOriginal.SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
  if (entornoOriginal.SUPABASE_KEY === undefined) delete process.env.SUPABASE_KEY;
});

/** JWT de prueba sin firma válida: solo importa el `role` de la carga. */
function jwtFalso(role) {
  const parte = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${parte({ alg: 'HS256', typ: 'JWT' })}.${parte({ role })}.firma`;
}

test('GET /health responde 200 con status ok', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('sirve la página principal y la capa de datos desde public/', async () => {
  const pagina = await fetch(`${base}/`);
  assert.equal(pagina.status, 200);
  assert.match(await pagina.text(), /Mini Inventario/);

  const datos = await fetch(`${base}/productos.js`);
  assert.equal(datos.status, 200);
  assert.match(datos.headers.get('content-type'), /javascript/);
});

test('sirve el cliente de Supabase para el navegador', async () => {
  const res = await fetch(`${base}/vendor/supabase.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
});

test('GET /favicon.ico responde 200 y sirve un icono ICO', async () => {
  const res = await fetch(`${base}/favicon.ico`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^image\//);
  const icono = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(icono.subarray(0, 4), Buffer.from([0, 0, 1, 0]));
});

test('GET /config.js entrega la URL y una llave publishable', async () => {
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.SUPABASE_KEY = 'sb_publishable_abc123';

  const res = await fetch(`${base}/config.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const cuerpo = await res.text();
  assert.match(cuerpo, /export const SUPABASE_URL = "https:\/\/ejemplo\.supabase\.co";/);
  assert.match(cuerpo, /export const SUPABASE_KEY = "sb_publishable_abc123";/);
});

test('GET /config.js acepta la llave anon heredada', async () => {
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.SUPABASE_KEY = jwtFalso('anon');

  const res = await fetch(`${base}/config.js`);
  assert.equal(res.status, 200);
});

test('GET /config.js nunca entrega una llave service_role ni secret', async () => {
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co';

  for (const llave of [jwtFalso('service_role'), 'sb_secret_abc123', 'cualquier-cosa']) {
    process.env.SUPABASE_KEY = llave;
    const res = await fetch(`${base}/config.js`);
    assert.equal(res.status, 500);
    assert.ok(!(await res.text()).includes(llave), `no debe filtrar ${llave}`);
  }
});

test('GET /config.js responde 500 si falta la configuración', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_KEY;

  const res = await fetch(`${base}/config.js`);
  assert.equal(res.status, 500);
});

test('esLlavePublica distingue llaves públicas de privadas', () => {
  assert.equal(esLlavePublica('sb_publishable_x'), true);
  assert.equal(esLlavePublica(jwtFalso('anon')), true);
  assert.equal(esLlavePublica(jwtFalso('service_role')), false);
  assert.equal(esLlavePublica('sb_secret_x'), false);
  assert.equal(esLlavePublica(''), false);
  assert.equal(esLlavePublica(undefined), false);
});
