// Cliente de Supabase del navegador. La URL y la llave pública (publishable o
// anon) llegan desde /config.js; la seguridad de los datos depende de RLS.
// `window.supabase` lo define /vendor/supabase.js (build UMD de supabase-js).
import { SUPABASE_URL, SUPABASE_KEY } from '/config.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // procesa el enlace de confirmación de correo
  },
});
