import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/server.js';

let servidor;
let base;

before(async () => {
  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once('listening', resolve));
  base = `http://localhost:${servidor.address().port}`;
});

after(() => servidor.close());

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
