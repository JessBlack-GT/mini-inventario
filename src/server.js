import express from 'express';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const carpetaPublica = path.join(__dirname, '..', 'public');
const require = createRequire(import.meta.url);
// Build UMD de supabase-js para el navegador (versión fija en package-lock.json).
const clienteSupabase = path.join(
  path.dirname(require.resolve('@supabase/supabase-js/package.json')),
  'dist',
  'umd',
  'supabase.js',
);

export const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Indica si la llave es pública: una publishable (`sb_publishable_...`) o una
 * `anon` heredada (JWT con role = "anon"). Cualquier otra (`sb_secret_...`,
 * `service_role`, texto desconocido) se rechaza para no enviarla al navegador.
 */
export function esLlavePublica(llave) {
  if (typeof llave !== 'string' || llave.length === 0) return false;
  if (llave.startsWith('sb_publishable_')) return true;

  const partes = llave.split('.');
  if (partes.length !== 3) return false;
  try {
    const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    return carga?.role === 'anon';
  } catch {
    return false;
  }
}

// Entrega al navegador la URL y la llave pública de Supabase como módulo ES.
app.get('/config.js', (_req, res) => {
  const url = process.env.SUPABASE_URL?.trim();
  const llave = process.env.SUPABASE_KEY?.trim();

  res.type('application/javascript').set('Cache-Control', 'no-store');

  if (!url || !llave) {
    console.error('Faltan SUPABASE_URL o SUPABASE_KEY en .env');
    return res.status(500).send('throw new Error("Configuración de Supabase incompleta");\n');
  }
  if (!esLlavePublica(llave)) {
    console.error('SUPABASE_KEY no es una llave publishable ni anon; no se envía al navegador.');
    return res.status(500).send('throw new Error("Llave de Supabase no permitida");\n');
  }

  res.send(
    `export const SUPABASE_URL = ${JSON.stringify(url)};\n` +
      `export const SUPABASE_KEY = ${JSON.stringify(llave)};\n`,
  );
});

app.get('/vendor/supabase.js', (_req, res) => {
  res.sendFile(clienteSupabase);
});

app.use(express.static(carpetaPublica));

// Solo arranca el servidor si este archivo se ejecuta directamente (no al importarlo en pruebas).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.warn('No se encontró .env; copia .env.example y completa los valores.');
  }

  const puerto = Number(process.env.PORT) || 3000;
  // 0.0.0.0 acepta conexiones de fuera del contenedor (el mapeo de puertos de Docker).
  const host = '0.0.0.0';
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
}
