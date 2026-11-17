// Registro, inicio y cierre de sesión con correo y contraseña (docs/diseno.md §5).
import { supabase } from './supabase.js';

export class ErrorAuth extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorAuth';
  }
}

export const MENSAJE_REGISTRO =
  'Si el correo es válido, recibirás un enlace para confirmar tu cuenta.';

/**
 * Crea la cuenta. No inicia sesión: Supabase envía un correo de confirmación.
 * El mensaje es el mismo exista o no el correo, para no revelar cuentas.
 */
export async function registrar(correo, contrasena) {
  validar(correo, contrasena);
  const { error } = await supabase.auth.signUp({
    email: correo,
    password: contrasena,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) {
    if (error.code === 'weak_password') {
      throw new ErrorAuth('La contraseña debe tener al menos 8 caracteres');
    }
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      throw new ErrorAuth('Demasiados intentos. Espera un momento y vuelve a intentarlo');
    }
    console.error(error);
    throw new ErrorAuth('No se pudo crear la cuenta. Inténtalo de nuevo');
  }
  return MENSAJE_REGISTRO;
}

export async function iniciarSesion(correo, contrasena) {
  validar(correo, contrasena);
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
  if (error) {
    if (error.code === 'email_not_confirmed') {
      throw new ErrorAuth('Confirma tu correo antes de iniciar sesión');
    }
    throw new ErrorAuth('Correo o contraseña incorrectos');
  }
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
}

/**
 * Devuelve el usuario con sesión válida o null. Valida contra Supabase con
 * getUser(), sin confiar solo en la sesión guardada en el navegador.
 */
export async function usuarioActual() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  return error ? null : user;
}

/** Avisa cuando la sesión empieza o termina (incluido en otra pestaña). */
export function alCambiarSesion(callback) {
  supabase.auth.onAuthStateChange((evento, session) => {
    // Diferido para no llamar a Supabase dentro del propio callback.
    setTimeout(() => callback(evento, session), 0);
  });
}

function validar(correo, contrasena) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new ErrorAuth('Escribe un correo válido');
  }
  if (contrasena.length < 8) {
    throw new ErrorAuth('La contraseña debe tener al menos 8 caracteres');
  }
}
