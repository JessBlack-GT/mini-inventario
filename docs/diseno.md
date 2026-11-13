# Diseño técnico — Mini Inventario

Este documento describe cómo se construirá lo definido en `docs/requisitos.md` (HU1–HU5).

## 1. Arquitectura

```
Navegador (HTML + JavaScript sin framework)
   │  1) Registro, confirmación de correo e inicio de sesión ──► Supabase Auth
   │  2) /api/productos  (Authorization: Bearer <token>)
   ▼
Servidor Node.js 22 + Express
   │  sirve /public y expone la API de productos
   │  consulta Supabase con el token del usuario
   ▼
Supabase (Postgres) ── tabla productos con Row Level Security (RLS)
                     └─ función ajustar_cantidad (RPC)
```

| Pieza | Tecnología | Responsabilidad |
|---|---|---|
| Frontend | HTML, CSS y JavaScript sin framework (módulos ES) | Pantallas, formularios, lista, filtro y búsqueda; manejo de sesión con `@supabase/supabase-js` |
| Backend | Node.js 22 + Express | Servir los archivos estáticos y la API REST `/api/productos`; verificar el token y validar los datos |
| Autenticación | Supabase Auth (correo y contraseña, con confirmación de correo) | Crear cuentas, confirmar correos, guardar contraseñas cifradas, emitir tokens de sesión (JWT) |
| Base de datos | Supabase Postgres | Tabla `productos`, restricciones, políticas RLS y función `ajustar_cantidad` |
| Utilidades | Python 3.12 | Solo scripts (p. ej. cargar los datos de prueba); no forma parte de la web |

**Decisiones clave**

- El navegador habla con Supabase **solo para autenticarse**. Todas las operaciones de productos pasan por Express.
- Express crea, en cada petición, un cliente de Supabase con la clave pública (`anon`) **y el token del usuario**. Así las políticas RLS se aplican también desde el backend.
- **No se usa la clave `service_role`**, porque saltaría las políticas RLS.
- "Bajo mínimo" no se guarda en la base de datos: se calcula como `cantidad < minimo`.
- La búsqueda y el filtro "Solo bajo mínimo" se aplican en el navegador sobre la lista ya cargada, porque cada inventario es pequeño.
- El ajuste rápido de cantidad se hace con una función de Postgres llamada por RPC, para que sea atómico (sección 3.1).

## 2. Estructura de carpetas propuesta

```
mini-inventario/
├── package.json
├── .env.example            # nombres de las variables, sin valores reales
├── src/
│   ├── server.js           # arranque de Express y archivos estáticos
│   ├── auth.js             # middleware: verifica el token (401)
│   ├── validaciones.js     # validación de los datos de productos
│   └── rutas/productos.js  # endpoints /api/productos
├── public/
│   ├── index.html          # inicio de sesión y registro
│   ├── inventario.html     # lista, formulario, filtro y búsqueda
│   ├── css/estilos.css
│   └── js/
│       ├── supabase.js     # cliente de Supabase del navegador
│       ├── auth.js         # registro, inicio y cierre de sesión
│       └── inventario.js   # comprobación de sesión, llamadas a la API y renderizado
├── supabase/esquema.sql    # tabla, índices, políticas RLS y función ajustar_cantidad
└── scripts/                # utilidades en Python 3.12
```

## 3. Modelo de datos: tabla `productos`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` | Clave primaria; `default gen_random_uuid()` |
| `user_id` | `uuid` | Obligatorio; referencia a `auth.users(id)`; `default auth.uid()`; borrado en cascada |
| `nombre` | `text` | Obligatorio; de 1 a 100 caracteres sin contar espacios al inicio y al final |
| `sku` | `text` | Obligatorio; de 1 a 50 caracteres; sin espacios al inicio ni al final; único por usuario sin distinguir mayúsculas |
| `cantidad` | `integer` | Obligatorio; `>= 0`; `default 0` |
| `minimo` | `integer` | Obligatorio; `>= 0`; `default 0` |
| `created_at` | `timestamptz` | Obligatorio; `default now()` |

Definición prevista para `supabase/esquema.sql`:

```sql
create table public.productos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  nombre      text not null check (char_length(btrim(nombre)) between 1 and 100),
  sku         text not null check (char_length(sku) between 1 and 50 and sku = btrim(sku)),
  cantidad    integer not null default 0 check (cantidad >= 0),
  minimo      integer not null default 0 check (minimo >= 0),
  created_at  timestamptz not null default now()
);

-- SKU único dentro de cada inventario, sin distinguir mayúsculas (HU2.4, HU2.5, HU5.2)
create unique index productos_user_sku_unico on public.productos (user_id, lower(sku));

-- Cada cuenta solo ve y modifica sus propios productos (HU1.6, HU3.1, HU4.6, HU5.5)
alter table public.productos enable row level security;

create policy "ver propios"      on public.productos for select using (auth.uid() = user_id);
create policy "crear propios"    on public.productos for insert with check (auth.uid() = user_id);
create policy "editar propios"   on public.productos for update using (auth.uid() = user_id)
                                                     with check (auth.uid() = user_id);
create policy "eliminar propios" on public.productos for delete using (auth.uid() = user_id);
```

La tabla **no tiene columna de contraseña**: las contraseñas viven solo en Supabase Auth (HU1.7).

### 3.1 Ajuste atómico de la cantidad: función `ajustar_cantidad` (RPC)

```sql
create or replace function public.ajustar_cantidad(p_id uuid, p_delta integer)
returns public.productos
language plpgsql
security invoker              -- se ejecuta con los permisos del usuario: RLS sigue activo
set search_path = ''          -- evita que se resuelvan objetos de otros esquemas
as $$
declare
  v_producto public.productos;
begin
  if p_delta is null or p_delta not in (1, -1) then
    raise exception 'delta inválido' using errcode = '22023';
  end if;

  update public.productos
     set cantidad = cantidad + p_delta
   where id = p_id
     and user_id = (select auth.uid())   -- comprobación explícita de propiedad, además de RLS
  returning * into v_producto;

  if not found then
    raise exception 'producto no encontrado' using errcode = 'P0002';
  end if;

  return v_producto;
end;
$$;

-- Permisos: primero se revoca explícitamente; después se concede solo a usuarios autenticados.
-- Postgres concede EXECUTE a PUBLIC por defecto, y Supabase lo concede además a anon
-- en las funciones nuevas del esquema public.
revoke execute on function public.ajustar_cantidad(uuid, integer) from public;
revoke execute on function public.ajustar_cantidad(uuid, integer) from anon;
grant  execute on function public.ajustar_cantidad(uuid, integer) to authenticated;
```

Garantías:

- **Atomicidad:** la suma se hace en un único `UPDATE` sobre el valor actual de la fila. Postgres bloquea la fila durante la operación, así que dos clics simultáneos (5 → +1 y +1) dan 7, nunca 6. El navegador no lee la cantidad para escribirla después.
- **Seguridad:** `security invoker` mantiene las políticas RLS de `select` y `update`. Además, `user_id = auth.uid()` comprueba la propiedad de forma explícita. Solo el rol `authenticated` puede ejecutar la función.
- **Sin cantidades negativas:** si la cantidad es 0 y el ajuste es −1, el `check (cantidad >= 0)` rechaza el cambio con el error `23514` y la fila no se modifica.
- **Solo +1 o −1:** la función rechaza cualquier otro valor, aunque alguien la llame saltándose Express.

## 4. API de Express

Todas las rutas `/api/*` exigen la cabecera `Authorization: Bearer <token>`.

| Método y ruta | Uso | Respuestas |
|---|---|---|
| `GET /api/productos` | Listar mis productos (más recientes primero) | 200, 401 |
| `POST /api/productos` | Crear un producto (HU2) | 201, 400, 401, 409 |
| `PUT /api/productos/:id` | Editar nombre, SKU, cantidad y mínimo (HU5) | 200, 400, 401, 404, 409 |
| `PATCH /api/productos/:id/cantidad` | Ajuste rápido `{ "delta": 1 \| -1 }`; llama a `supabase.rpc('ajustar_cantidad', { p_id, p_delta })` con el cliente del usuario (HU4) | 200, 400, 401, 404 |
| `DELETE /api/productos/:id` | Eliminar un producto (HU5) | 204, 401, 404 |
| `GET /config.js` | Entregar al navegador la URL y la clave pública `anon` de Supabase | 200 |

- **400:** datos inválidos. La respuesta indica el campo y el mensaje que mostrará el formulario.
- **401:** falta el token, o es inválido o expiró.
- **404:** el producto no existe o pertenece a otra cuenta. RLS lo hace invisible, así que no se revela si existe (cumple el "403 o 404" de los requisitos).
- **409:** SKU duplicado (error Postgres `23505`) → "El SKU ya existe".

Traducción de errores de `ajustar_cantidad`:

| Error de Postgres | Respuesta | Mensaje |
|---|---|---|
| `22023` (delta inválido) | 400 | "Ajuste no válido" |
| `23514` (quedaría negativa) | 400 | "La cantidad no puede ser negativa" |
| `P0002` (no existe o es de otra cuenta) | 404 | "Producto no encontrado" |
| `22P02` (el id no es un UUID) | 404 | "Producto no encontrado" |

## 5. Autenticación, confirmación de correo y sesión

**Configuración en el panel de Supabase**

- **"Confirm email" activado** (valor por defecto). Supabase solo emite sesión después de la confirmación (HU1.1). Ante un correo ya registrado no devuelve error, sino una respuesta equivalente a la de un registro nuevo (HU1.2).
- Longitud mínima de contraseña: **8** (Supabase usa 6 por defecto) → HU1.3.
- **Site URL y Redirect URLs:** apuntan a `inventario.html` (en desarrollo, `http://localhost:3000/inventario.html`). El registro pasa esa dirección en `options.emailRedirectTo`.

**Flujo**

1. **Registro:** `public/js/auth.js` llama a `supabase.auth.signUp` con `emailRedirectTo` apuntando a `inventario.html`. No se inicia sesión. Si no hay error de validación, se muestra siempre "Si el correo es válido, recibirás un enlace para confirmar tu cuenta", exista o no el correo.
2. **Confirmación:** el enlace del correo lleva a `inventario.html` con los datos de sesión en la URL. `supabase-js` los procesa al cargar (`detectSessionInUrl`).
3. **Comprobación de sesión en `inventario.html`:** antes de mostrar nada del inventario, `inventario.js`:
   - obtiene la sesión con `supabase.auth.getSession()`;
   - la valida contra Supabase con `supabase.auth.getUser()`, sin confiar solo en lo guardado en el navegador;
   - si hay sesión válida, limpia los datos de la URL (`history.replaceState`) y carga los productos;
   - **si no hay sesión válida** (enlace expirado o ya usado, error en la URL, sesión cerrada o acceso directo), redirige a `index.html` y muestra el inicio de sesión. Si el fallo vino del enlace, añade el aviso "El enlace no es válido o expiró. Inicia sesión".
4. **Inicio de sesión:** `signInWithPassword`.
   - Con el error `email_not_confirmed`, muestra "Confirma tu correo antes de iniciar sesión". Solo ocurre si la contraseña es correcta, así que no revela a terceros si el correo existe.
   - Con cualquier otro fallo, muestra "Correo o contraseña incorrectos".
   - Si tiene éxito, va a `inventario.html`, que vuelve a hacer la comprobación del paso 3.
5. **Peticiones a la API:** `inventario.js` envía el token en `Authorization: Bearer <token>`. Si la API responde 401, se redirige a `index.html`.
6. **Verificación en Express:** `src/auth.js` valida el token con `supabase.auth.getUser(token)`. Si no es válido, responde 401.
7. **Cierre de sesión:** `supabase.auth.signOut()` y redirección a `index.html` (HU1.5).

## 6. Qué valida cada capa

La regla es que **ninguna capa confía en la anterior**: el navegador mejora la experiencia, Express protege la API y la base de datos es la garantía final.

| Regla | Navegador | Express | Supabase Auth | Postgres |
|---|---|---|---|---|
| Correo con formato válido | `type="email"`, `required` | — | ✔ | — |
| Contraseña ≥ 8 caracteres | `minlength="8"` | — | ✔ (configuración) | — |
| Correo único, sin revelar si ya existe | Mensaje genérico | — | ✔ (respuesta equivalente) | — |
| Correo confirmado antes de iniciar sesión | Mensaje "Confirma tu correo…" | — | ✔ (`email_not_confirmed`) | — |
| Sesión válida | `getSession` + `getUser`; si no hay sesión, inicio de sesión | ✔ (401) | ✔ (emite y verifica el token) | ✔ (`auth.uid()`) |
| Nombre obligatorio, 1–100 | `required`, `maxlength="100"` | ✔ (recorta y comprueba) | — | ✔ `check` |
| SKU obligatorio, 1–50, sin espacios extremos | `required`, `maxlength="50"` | ✔ (recorta y comprueba) | — | ✔ `check` |
| Cantidad y mínimo enteros ≥ 0 | `type="number" min="0" step="1"` | ✔ (`Number.isInteger`, ≥ 0) | — | ✔ `integer` + `check` |
| SKU único por usuario | — | Traduce `23505` a 409 | — | ✔ índice único `(user_id, lower(sku))` |
| Ajuste solo +1 o −1, atómico y sin negativos | Botones +/− (− deshabilitado en 0) | ✔ (`delta` ∈ {1, −1}) | — | ✔ `ajustar_cantidad` + `check (cantidad >= 0)` + RLS |
| Solo mis productos | — | No acepta `user_id` del cliente | — | ✔ políticas RLS y comprobación en `ajustar_cantidad` |
| Confirmar antes de eliminar | ✔ `confirm()` con el nombre | — | — | — |

**Frontend (HTML + JavaScript):** valida en el momento para mostrar el error junto al campo sin llamar al servidor. Comprueba la sesión antes de mostrar el inventario. Muestra los mensajes de 400, 409 y 404 que devuelve la API. Es fácil de saltar, así que no se confía en él.

**Express:** es la primera barrera real.
- Comprueba el token.
- Acepta solo los campos esperados: ignora cualquier `id`, `user_id` o `created_at` enviado por el cliente.
- Recorta espacios y verifica tipos y rangos.
- Valida que `:id` sea un UUID; si no lo es, responde 404.
- Traduce los errores de la base de datos a respuestas claras.

**Supabase Auth:** valida el correo, la longitud de la contraseña, que el correo no exista y que esté confirmado antes de emitir sesión. Guarda la contraseña cifrada y firma los tokens.

**Postgres:** aplica `not null`, `check`, el índice único, RLS y las comprobaciones de `ajustar_cantidad`. Aunque alguien llamara a Supabase directamente con su token saltándose Express, no podría guardar datos inválidos ni tocar productos ajenos.

## 7. Configuración y secretos

`.env` (nunca se sube; ya está en `.gitignore`) y `.env.example` (sí se sube, sin valores):

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
PORT=3000
```

- La clave `anon` es pública por diseño. La seguridad de los datos depende de RLS, no de ocultarla.
- La clave `service_role` no se usa, y la contraseña de la base de datos no se guarda en el proyecto.

## 8. Trazabilidad con los requisitos

| Historia | Frontend | Express | Supabase |
|---|---|---|---|
| HU1 Cuenta y sesión | `index.html`, `js/auth.js`, comprobación de sesión en `inventario.js` | `src/auth.js` (401) | Auth con confirmación de correo, contraseña mínima de 8 y Redirect URL a `inventario.html` |
| HU2 Registrar producto | Formulario en `inventario.html` | `POST /api/productos`, `validaciones.js` | `check`, índice único, RLS `insert` |
| HU3 Ver y bajo mínimo | Lista, marca, contador, filtro y búsqueda en `inventario.js` | `GET /api/productos` | RLS `select` |
| HU4 Ajuste rápido | Botones +/− | `PATCH /api/productos/:id/cantidad` → RPC | `ajustar_cantidad` (atómica, `security invoker`), `check (cantidad >= 0)`, RLS |
| HU5 Editar y eliminar | Formulario de edición, `confirm()` | `PUT` y `DELETE /api/productos/:id` | Índice único, RLS `update` y `delete` |

## 9. Pruebas previstas

- **Validaciones (`node:test`):** pruebas unitarias de `src/validaciones.js` con los casos límite de los requisitos (nombre vacío, SKU con espacios, cantidad −1 o 2.5, `delta` = 2).
- **API:** pruebas con dos cuentas (A y B) para 401, 404 entre cuentas y 409 por SKU duplicado.
- **Concurrencia del ajuste:** enviar dos `PATCH +1` simultáneos sobre `TOR-M4` (cantidad 5) y comprobar que el resultado es 7.
- **Confirmación de correo:**
  - registrar un correo nuevo y uno existente, y comprobar que el mensaje es idéntico;
  - intentar iniciar sesión antes de confirmar;
  - abrir el enlace y llegar al inventario;
  - abrir un enlace ya usado y ver el inicio de sesión.
- **Manual:** los datos de prueba de `docs/requisitos.md` (`TOR-M4`, `TUE-M4`, `ARA-M4`) en el navegador.
- **Script en Python 3.12 (opcional):** cargar esos datos de prueba en la cuenta A.
