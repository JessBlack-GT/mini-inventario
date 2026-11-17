// Capa de acceso a datos de productos.
//
// Es el ÚNICO archivo que sabe dónde se guardan los productos. Por ahora usa
// localStorage; después se reemplazará por Supabase. Para que ese cambio no
// afecte a la interfaz, todas las funciones son asíncronas (devuelven Promesas)
// y los errores se lanzan como ErrorProducto con el campo afectado.

const CLAVE = 'mini-inventario:productos';
// Máximo de la columna `integer` de Postgres (docs/diseno.md §3).
const MAXIMO_ENTERO = 2147483647;

export class ErrorProducto extends Error {
  /**
   * @param {string} mensaje Texto para mostrar a la persona.
   * @param {string|null} campo 'nombre' | 'sku' | 'cantidad' | 'minimo' | null
   */
  constructor(mensaje, campo = null) {
    super(mensaje);
    this.name = 'ErrorProducto';
    this.campo = campo;
  }
}

/** Un producto está bajo mínimo solo si cantidad < mínimo (igual NO cuenta). */
export function estaBajoMinimo(producto) {
  return producto.cantidad < producto.minimo;
}

/** Devuelve los productos, los más recientes primero. */
export async function listarProductos() {
  return leer().sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export async function obtenerProducto(id) {
  const producto = leer().find((p) => p.id === id);
  if (!producto) throw new ErrorProducto('Producto no encontrado');
  return producto;
}

/** Crea un producto a partir de { nombre, sku, cantidad, minimo }. */
export async function crearProducto(datos) {
  const limpio = validar(datos);
  const productos = leer();
  comprobarSkuUnico(productos, limpio.sku);

  const producto = {
    id: crypto.randomUUID(),
    ...limpio,
    creadoEn: new Date().toISOString(),
  };
  productos.push(producto);
  guardar(productos);
  return producto;
}

/** Reemplaza nombre, SKU, cantidad y mínimo de un producto existente. */
export async function actualizarProducto(id, datos) {
  const limpio = validar(datos);
  const productos = leer();
  const indice = productos.findIndex((p) => p.id === id);
  if (indice === -1) throw new ErrorProducto('Producto no encontrado');
  comprobarSkuUnico(productos, limpio.sku, id);

  productos[indice] = { ...productos[indice], ...limpio };
  guardar(productos);
  return productos[indice];
}

// ---------------------------------------------------------------------------
// Validación (mismas reglas que docs/requisitos.md y docs/diseno.md §6)

function validar(datos) {
  const nombre = String(datos?.nombre ?? '').trim();
  if (nombre.length < 1) throw new ErrorProducto('El nombre es obligatorio', 'nombre');
  if (nombre.length > 100) throw new ErrorProducto('El nombre admite como máximo 100 caracteres', 'nombre');

  const sku = String(datos?.sku ?? '').trim();
  if (sku.length < 1) throw new ErrorProducto('El SKU es obligatorio', 'sku');
  if (sku.length > 50) throw new ErrorProducto('El SKU admite como máximo 50 caracteres', 'sku');

  const cantidad = entero(datos?.cantidad, 'cantidad', 'La cantidad');
  const minimo = entero(datos?.minimo, 'minimo', 'La cantidad mínima');

  return { nombre, sku, cantidad, minimo };
}

function entero(valor, campo, etiqueta) {
  const texto = String(valor ?? '').trim();
  // Solo dígitos: rechaza vacío, negativos, decimales, notación científica y texto.
  if (!/^\d+$/.test(texto)) {
    throw new ErrorProducto(`${etiqueta} debe ser un número entero mayor o igual a 0`, campo);
  }
  const numero = Number(texto);
  if (numero > MAXIMO_ENTERO) {
    throw new ErrorProducto(`${etiqueta} no puede ser mayor que ${MAXIMO_ENTERO}`, campo);
  }
  return numero;
}

function comprobarSkuUnico(productos, sku, idExcluido = null) {
  const clave = sku.toLowerCase();
  const repetido = productos.some((p) => p.id !== idExcluido && p.sku.toLowerCase() === clave);
  if (repetido) throw new ErrorProducto('El SKU ya existe', 'sku');
}

// ---------------------------------------------------------------------------
// Almacenamiento (localStorage). Lo único que cambiará con Supabase.

function leer() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

function guardar(productos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(productos));
  } catch {
    throw new ErrorProducto('No se pudo guardar en este navegador');
  }
}
