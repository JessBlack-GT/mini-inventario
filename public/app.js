// Interfaz de la página de inventario. No accede a los datos directamente:
// todo pasa por productos.js.
import {
  listarProductos,
  obtenerProducto,
  crearProducto,
  actualizarProducto,
  estaBajoMinimo,
  ErrorProducto,
} from './productos.js';

const formulario = document.getElementById('formulario');
const tituloFormulario = document.getElementById('titulo-formulario');
const botonGuardar = document.getElementById('boton-guardar');
const botonCancelar = document.getElementById('boton-cancelar');
const cuerpoTabla = document.getElementById('cuerpo-tabla');
const tabla = document.getElementById('tabla');
const vacio = document.getElementById('vacio');
const contador = document.getElementById('contador');

formulario.addEventListener('submit', alGuardar);
botonCancelar.addEventListener('click', salirDeEdicion);
cuerpoTabla.addEventListener('click', alPulsarEnTabla);

pintarLista();

async function pintarLista() {
  const productos = await listarProductos();

  vacio.hidden = productos.length > 0;
  tabla.hidden = productos.length === 0;
  cuerpoTabla.replaceChildren(...productos.map(filaDeProducto));

  const bajos = productos.filter(estaBajoMinimo).length;
  contador.textContent = bajos === 1 ? '1 producto bajo mínimo' : `${bajos} productos bajo mínimo`;
  contador.classList.toggle('alerta', bajos > 0);
}

function filaDeProducto(producto) {
  const fila = document.createElement('tr');
  const bajo = estaBajoMinimo(producto);
  if (bajo) fila.classList.add('bajo-minimo');

  fila.append(
    celda(producto.nombre),
    celda(producto.sku, 'sku'),
    celda(String(producto.cantidad), 'num'),
    celda(String(producto.minimo), 'num'),
  );

  const estado = document.createElement('td');
  const marca = document.createElement('span');
  marca.className = bajo ? 'marca' : 'marca suficiente';
  marca.textContent = bajo ? 'Bajo mínimo' : 'Stock suficiente';
  estado.append(marca);
  fila.append(estado);

  const acciones = document.createElement('td');
  const editar = document.createElement('button');
  editar.type = 'button';
  editar.className = 'secundario';
  editar.dataset.editar = producto.id;
  editar.textContent = 'Editar';
  editar.setAttribute('aria-label', `Editar ${producto.nombre}`);
  acciones.append(editar);
  fila.append(acciones);

  return fila;
}

function celda(texto, clase) {
  const td = document.createElement('td');
  td.textContent = texto; // textContent evita inyectar HTML desde los datos.
  if (clase) td.className = clase;
  return td;
}

async function alGuardar(evento) {
  evento.preventDefault();
  limpiarErrores();

  const datos = Object.fromEntries(new FormData(formulario));
  const { id } = datos;

  botonGuardar.disabled = true;
  try {
    if (id) {
      await actualizarProducto(id, datos);
    } else {
      await crearProducto(datos);
    }
    salirDeEdicion();
    await pintarLista();
    formulario.elements.nombre.focus();
  } catch (error) {
    mostrarError(error);
  } finally {
    botonGuardar.disabled = false;
  }
}

async function alPulsarEnTabla(evento) {
  const boton = evento.target.closest('button[data-editar]');
  if (!boton) return;

  try {
    const producto = await obtenerProducto(boton.dataset.editar);
    entrarEnEdicion(producto);
  } catch (error) {
    mostrarError(error);
    await pintarLista();
  }
}

function entrarEnEdicion(producto) {
  limpiarErrores();
  const campos = formulario.elements;
  campos.id.value = producto.id;
  campos.nombre.value = producto.nombre;
  campos.sku.value = producto.sku;
  campos.cantidad.value = producto.cantidad;
  campos.minimo.value = producto.minimo;

  tituloFormulario.textContent = `Editar «${producto.nombre}»`;
  botonGuardar.textContent = 'Guardar cambios';
  botonCancelar.hidden = false;
  campos.nombre.focus();
}

function salirDeEdicion() {
  formulario.reset();
  formulario.elements.id.value = '';
  limpiarErrores();
  tituloFormulario.textContent = 'Agregar producto';
  botonGuardar.textContent = 'Agregar';
  botonCancelar.hidden = true;
}

function mostrarError(error) {
  const esConocido = error instanceof ErrorProducto;
  if (!esConocido) console.error(error);

  const campo = esConocido && error.campo ? error.campo : 'general';
  const mensaje = esConocido ? error.message : 'Ocurrió un error inesperado';

  const destino = formulario.querySelector(`[data-error-de="${campo}"]`);
  destino.textContent = mensaje;

  const input = formulario.elements[campo];
  if (input instanceof HTMLElement) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
}

function limpiarErrores() {
  formulario.querySelectorAll('[data-error-de]').forEach((p) => (p.textContent = ''));
  formulario.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
}
