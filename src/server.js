import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const carpetaPublica = path.join(__dirname, '..', 'public');

export const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(express.static(carpetaPublica));

// Solo arranca el servidor si este archivo se ejecuta directamente (no al importarlo en pruebas).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PORT) || 3000;
  app.listen(puerto, () => {
    console.log(`Mini Inventario escuchando en http://localhost:${puerto}`);
  });
}
