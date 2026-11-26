// Comprueba GET /health para el HEALTHCHECK de Docker.
// Sale con 0 si el servidor responde 2xx y con 1 en cualquier otro caso.
const puerto = Number(process.env.PORT) || 3000;

try {
  const respuesta = await fetch(`http://127.0.0.1:${puerto}/health`, {
    signal: AbortSignal.timeout(4000),
  });
  process.exit(respuesta.ok ? 0 : 1);
} catch {
  process.exit(1);
}
