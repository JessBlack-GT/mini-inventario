// Interfaz de la página. No accede a los datos directamente: los productos
// pasan por productos.js y la sesión por auth.js.
import {
  listarProductos,
  obtenerProducto,
  crearProducto,
  actualizarProducto,
  estaBajoMinimo,
  ErrorProducto,
} from './productos.js';
import {
  registrar,
  iniciarSesion,
  cerrarSesion,
  usuarioActual,
  alCambiarSesion,
  ErrorAuth,
} from './auth.js';

const formulario = document.getElementById('formulario');
const tituloFormulario = document.getElementById('titulo-formulario');
const botonGuardar = document.getElementById('boton-guardar');
const botonCancelar = document.getElementById('boton-cancelar');
const cuerpoTabla = document.getElementById('cuerpo-tabla');
const tabla = document.getElementById('tabla');
const vacio = document.getElementById('vacio');
const contador = document.getElementById('contador');

const cargando = document.getElementById('cargando');
const vistaAcceso = document.getElementById('vista-acceso');
const vistaInventario = document.getElementById('vista-inventario');
const formularioAcceso = document.getElementById('formulario-acceso');
const tituloAcceso = document.getElementById('titulo-acceso');
const botonAcceso = document.getElementById('boton-acceso');
const botonCambiarModo = document.getElementById('boton-cambiar-modo');
const errorAcceso = document.getElementById('error-acceso');
const avisoAcceso = document.getElementById('aviso-acceso');
const sesion = document.getElementById('sesion');
const correoUsuario = document.getElementById('correo-usuario');
const botonSalir = document.getElementById('boton-salir');
const campoContrasena = document.getElementById('contrasena');
const botonVerContrasena = document.getElementById('boton-ver-contrasena');

let modoRegistro = false;

formulario.addEventListener('submit', alGuardar);
botonCancelar.addEventListener('click', salirDeEdicion);
cuerpoTabla.addEventListener('click', alPulsarEnTabla);
formularioAcceso.addEventListener('submit', alEnviarAcceso);
botonCambiarModo.addEventListener('click', () => cambiarModo(!modoRegistro));
botonSalir.addEventListener('click', alCerrarSesion);
// Botón nativo type="button": responde a clic, Enter y Espacio sin enviar el formulario.
botonVerContrasena.addEventListener('click', () => {
  verContrasena(campoContrasena.type === 'password');
});

iniciar();

// ---------------------------------------------------------------------------
// Sesión

async function iniciar() {
  // Si el enlace de confirmación trae un error (expirado o ya usado), avisarlo.
  const parametros = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
  const falloEnlace = parametros.has('error') || parametros.has('error_description');

  const usuario = await usuarioActual();
  // Limpia los datos de sesión o error que dejó el enlace en la URL.
  if (window.location.hash || window.location.search) {
    history.replaceState(null, '', window.location.pathname);
  }

  if (usuario) {
    await mostrarInventario(usuario);
  } else {
    mostrarAcceso(falloEnlace ? 'El enlace no es válido o expiró. Inicia sesión' : '');
  }

  alCambiarSesion(async (evento, session) => {
    if (evento === 'SIGNED_OUT' || !session) {
      mostrarAcceso();
    } else if (evento === 'SIGNED_IN' && vistaInventario.hidden) {
      await mostrarInventario(session.user);
    }
  });
}

async function mostrarInventario(usuario) {
  cargando.hidden = true;
  vistaAcceso.hidden = true;
  formularioAcceso.reset();
  verContrasena(false);
  correoUsuario.textContent = usuario.email ?? '';
  sesion.hidden = false;
  contador.hidden = false;
  vistaInventario.hidden = false;
  salirDeEdicion();
  try {
    await pintarLista();
  } catch (error) {
    mostrarError(error);
  }
}

function mostrarAcceso(mensajeError = '') {
  cargando.hidden = true;
  vistaInventario.hidden = true;
  sesion.hidden = true;
  contador.hidden = true;
  cuerpoTabla.replaceChildren(); // no dejar datos de la cuenta anterior en la página
  vistaAcceso.hidden = false;
  verContrasena(false);
  avisoAcceso.textContent = '';
  errorAcceso.textContent = mensajeError;
  formularioAcceso.elements.correo.focus();
}

/** Muestra u oculta la contraseña sin tocar lo escrito. */
function verContrasena(visible) {
  campoContrasena.type = visible ? 'text' : 'password';
  botonVerContrasena.textContent = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
}

function cambiarModo(registro) {
  modoRegistro = registro;
  tituloAcceso.textContent = registro ? 'Crear una cuenta' : 'Iniciar sesión';
  botonAcceso.textContent = registro ? 'Crear cuenta' : 'Iniciar sesión';
  botonCambiarModo.textContent = registro ? 'Ya tengo cuenta' : 'Crear una cuenta';
  formularioAcceso.elements.contrasena.autocomplete = registro ? 'new-password' : 'current-password';
  formularioAcceso.elements.correo.value = '';
  formularioAcceso.elements.contrasena.value = '';
  verContrasena(false);
  errorAcceso.textContent = '';
  avisoAcceso.textContent = '';
  formularioAcceso.elements.correo.focus();
}

async function alEnviarAcceso(evento) {
  evento.preventDefault();
  errorAcceso.textContent = '';
  avisoAcceso.textContent = '';

  const correo = formularioAcceso.elements.correo.value.trim();
  const contrasena = formularioAcceso.elements.contrasena.value;

  botonAcceso.disabled = true;
  try {
    if (modoRegistro) {
      avisoAcceso.textContent = await registrar(correo, contrasena);
      formularioAcceso.elements.contrasena.value = '';
    } else {
      // Al iniciar sesión, alCambiarSesion (SIGNED_IN) muestra el inventario.
      await iniciarSesion(correo, contrasena);
    }
  } catch (error) {
    if (!(error instanceof ErrorAuth)) console.error(error);
    errorAcceso.textContent =
      error instanceof ErrorAuth ? error.message : 'Ocurrió un error inesperado';
  } finally {
    botonAcceso.disabled = false;
  }
}

async function alCerrarSesion() {
  botonSalir.disabled = true;
  try {
    await cerrarSesion();
  } finally {
    botonSalir.disabled = false;
    mostrarAcceso();
  }
}

// ---------------------------------------------------------------------------
// Inventario

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
