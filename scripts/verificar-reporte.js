// Verifica que el reporte HTML de Playwright no contenga ningún secreto antes
// de publicarlo como artefacto en CI.
//
// Uso: node scripts/verificar-reporte.js [carpeta-del-reporte]
// Secretos revisados (del entorno): SUPABASE_URL, SUPABASE_KEY, TEST_EMAIL,
// TEST_PASSWORD.
//
// Revisa todos los archivos de la carpeta y, además, descomprime el zip en
// base64 que Playwright incrusta en index.html (<template id="playwrightReportBase64">),
// donde va el JSON con los pasos de cada prueba.
//
// Falla de forma cerrada: termina con código 1 si encuentra un secreto, si falta
// alguno en el entorno o si no puede leer el reporte por completo. Nunca imprime
// los valores, solo el nombre del secreto y el archivo.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const NOMBRES = ['SUPABASE_URL', 'SUPABASE_KEY', 'TEST_EMAIL', 'TEST_PASSWORD'];
const carpeta = process.argv[2] ?? 'playwright-report';

function fallar(mensaje) {
  console.error(`::error::Verificación del reporte: ${mensaje}`);
  process.exit(1);
}

/** Formas en que un valor puede aparecer escrito en el reporte. */
function variantes(valor) {
  return new Set([
    valor,
    JSON.stringify(valor).slice(1, -1), // escapado dentro de una cadena JSON
    encodeURIComponent(valor),
  ]);
}

/** Lee las entradas de un zip (método 0 o 8) a partir de su directorio central. */
function leerZip(buffer) {
  const FIN = 0x06054b50;
  let fin = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === FIN) { fin = i; break; }
  }
  if (fin < 0) throw new Error('no se encontró el final del directorio central');

  const total = buffer.readUInt16LE(fin + 10);
  let pos = buffer.readUInt32LE(fin + 16);
  if (total === 0xffff || pos === 0xffffffff) throw new Error('zip64 no soportado');

  const entradas = [];
  for (let n = 0; n < total; n++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error('directorio central dañado');
    const metodo = buffer.readUInt16LE(pos + 10);
    const tamComprimido = buffer.readUInt32LE(pos + 20);
    const largoNombre = buffer.readUInt16LE(pos + 28);
    const largoExtra = buffer.readUInt16LE(pos + 30);
    const largoComentario = buffer.readUInt16LE(pos + 32);
    const local = buffer.readUInt32LE(pos + 42);
    const nombre = buffer.toString('utf8', pos + 46, pos + 46 + largoNombre);

    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`cabecera local dañada (${nombre})`);
    const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const datos = buffer.subarray(inicio, inicio + tamComprimido);

    let contenido;
    if (metodo === 0) contenido = datos;
    else if (metodo === 8) contenido = inflateRawSync(datos);
    else throw new Error(`método de compresión ${metodo} no soportado (${nombre})`);

    entradas.push({ nombre, contenido });
    pos += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

function archivosDe(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? archivosDe(ruta) : [ruta];
  });
}

// 1. Secretos: todos deben existir para que la verificación tenga sentido.
const secretos = NOMBRES.map((nombre) => ({ nombre, valor: process.env[nombre]?.trim() ?? '' }));
const faltantes = secretos.filter((s) => !s.valor).map((s) => s.nombre);
if (faltantes.length) fallar(`faltan en el entorno: ${faltantes.join(', ')}`);

// 2. Contenidos a revisar: cada archivo y cada entrada del zip incrustado.
const contenidos = [];
let zipRevisado = false;
try {
  for (const ruta of archivosDe(carpeta)) {
    const buffer = readFileSync(ruta);
    const nombre = relative(carpeta, ruta);
    contenidos.push({ nombre, texto: buffer.toString('utf8') });

    if (nombre === 'index.html') {
      const html = buffer.toString('utf8');
      const marca = /<template id="playwrightReportBase64">data:application\/zip;base64,([A-Za-z0-9+/=\s]*)/;
      const coincidencia = html.match(marca);
      if (!coincidencia) throw new Error('index.html no contiene el zip incrustado');
      for (const entrada of leerZip(Buffer.from(coincidencia[1], 'base64'))) {
        contenidos.push({ nombre: `index.html → ${entrada.nombre}`, texto: entrada.contenido.toString('utf8') });
      }
      zipRevisado = true;
    }
  }
} catch (error) {
  fallar(`no se pudo leer el reporte (${error.message})`);
}
if (!zipRevisado) fallar(`no se encontró ${join(carpeta, 'index.html')}`);

// 3. Búsqueda.
const hallazgos = [];
for (const { nombre, texto } of contenidos) {
  for (const secreto of secretos) {
    for (const forma of variantes(secreto.valor)) {
      if (texto.includes(forma)) { hallazgos.push(`${secreto.nombre} en ${nombre}`); break; }
    }
  }
}

if (hallazgos.length) fallar(`el reporte contiene secretos: ${hallazgos.join('; ')}`);
console.log(`Reporte verificado: ${contenidos.length} contenidos revisados, sin secretos.`);
