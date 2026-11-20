// Capa de acceso a datos de productos.
//
// Es el ÚNICO archivo que sabe dónde se guardan los productos: la tabla
// public.productos de Supabase. RLS garantiza que cada cuenta solo lea y
// modifique sus propios productos; `user_id` lo asigna la base de datos
// (default auth.uid()), nunca el navegador. Los errores se lanzan como
// ErrorProducto con el campo afectado.

import { supabase } from './supabase.js';

const COLUMNAS = 'id, nombre, sku, cantidad, minimo, created_at';
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
  const { data, error } = await supabase
    .from('productos')
    .select(COLUMNAS)
    .order('created_at', { ascending: false });
  if (error) traducirError(error);
  return data;
}

export async function obtenerProducto(id) {
  const { data, error } = await supabase
    .from('productos')
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle();
  if (error) traducirError(error);
  if (!data) throw new ErrorProducto('Producto no encontrado');
  return data;
}

/** Crea un producto a partir de { nombre, sku, cantidad, minimo }. */
export async function crearProducto(datos) {
  const limpio = validar(datos);
  const { data, error } = await supabase
    .from('productos')
    .insert(limpio)
    .select(COLUMNAS)
    .single();
  if (error) traducirError(error);
  return data;
}

/** Reemplaza nombre, SKU, cantidad y mínimo de un producto existente. */
export async function actualizarProducto(id, datos) {
  const limpio = validar(datos);
  const { data, error } = await supabase
    .from('productos')
    .update(limpio)
    .eq('id', id)
    .select(COLUMNAS)
    .maybeSingle();
  if (error) traducirError(error);
  // Sin fila: no existe o es de otra cuenta (RLS la oculta).
  if (!data) throw new ErrorProducto('Producto no encontrado');
  return data;
}

/** Elimina un solo producto visible para la sesión actual. */
export async function eliminarProducto(id) {
  if (!id) throw new ErrorProducto('Producto no encontrado');
  const { data, error } = await supabase
    .from('productos')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) traducirError(error);
  // Una fila oculta por RLS o inexistente no cuenta como eliminada.
  if (!data) throw new ErrorProducto('Producto no encontrado');
}

// ---------------------------------------------------------------------------
// Validación (mismas reglas que docs/requisitos.md y docs/diseno.md §6).
// La base de datos vuelve a comprobarlas con `check` y el índice único.

function validar(datos) {
  const nombre = String(datos?.nombre ?? '').trim();
  if (nombre.length < 1) throw new ErrorProducto('El nombre es obligatorio', 'nombre');
  if (nombre.length > 100) throw new ErrorProducto('El nombre admite como máximo 100 caracteres', 'nombre');

  const sku = String(datos?.sku ?? '').trim();
  if (sku.length < 1) throw new ErrorProducto('El SKU es obligatorio', 'sku');
  if (sku.length > 50) throw new ErrorProducto('El SKU admite como máximo 50 caracteres', 'sku');

  const cantidad = entero(datos?.cantidad, 'cantidad', 'La cantidad');
  const minimo = entero(datos?.minimo, 'minimo', 'La cantidad mínima');

  // Solo los campos esperados: nunca id, user_id ni created_at del formulario.
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

// ---------------------------------------------------------------------------
// Traducción de errores de Postgres / PostgREST a mensajes para la persona.

function traducirError(error) {
  switch (error.code) {
    case '23505': // índice único (user_id, lower(sku))
      throw new ErrorProducto('El SKU ya existe', 'sku');
    case '23514': // algún `check` de la tabla
      throw new ErrorProducto('Los datos no son válidos');
    case '22P02': // el id no es un UUID
    case 'PGRST116':
      throw new ErrorProducto('Producto no encontrado');
    case '42501': // RLS o permisos: normalmente, sesión cerrada o expirada
    case 'PGRST301':
    case 'PGRST303':
      throw new ErrorProducto('Tu sesión expiró. Vuelve a iniciar sesión');
    default:
      console.error(error);
      throw new ErrorProducto('No se pudo conectar con el inventario. Inténtalo de nuevo');
  }
}
