# Bitácora — Día 2: Planeación de Mini Inventario

- **Fecha:** 2026-11-12
- **Repositorio:** https://github.com/JessBlack-GT/mini-inventario
- **Rama:** `dia-02-planeacion`
- **Asistente:** Claude Code

## 1. Objetivo y herramientas

**Objetivo:** planear Mini Inventario antes de escribir código. La planeación incluye definir los requisitos como historias de usuario con criterios de aceptación comprobables, proponer el diseño técnico y convertir cada historia en un issue de GitHub, revisando y corrigiendo las propuestas del agente.

| Herramienta | Uso en este día |
|---|---|
| Claude Code | Planeación en modo plan, redacción de documentos y ejecución de comandos con aprobación manual |
| Git | Rama `dia-02-planeacion` y commits locales |
| GitHub CLI (`gh`) | Verificación del repositorio y creación de los issues #3 a #7 |
| Node.js 22, Express, HTML, JavaScript sin framework y Supabase | Tecnologías definidas en el diseño (`docs/diseno.md`); todavía no están implementadas |

## 2. Resumen de actividades

1. **Planificación en modo plan.** Antes de proponer historias, el agente hizo cuatro preguntas. Las respuestas definieron:
   - registro abierto con inventario propio por cuenta;
   - acciones de editar, eliminar, ajuste rápido (+/−) y búsqueda o filtro;
   - SKU único por inventario, y "bajo mínimo" solo cuando `cantidad < mínimo`;
   - Node.js para la web y Python 3.12 solo para scripts.
2. **Cinco historias de usuario.** HU1 a HU5, con 31 criterios de aceptación, en `docs/requisitos.md` (commit `00f05d0`).
3. **Diseño técnico.** `docs/diseno.md` define la arquitectura, la tabla `productos`, las políticas RLS, la función RPC de ajuste, el flujo de confirmación de correo y las validaciones por capa. Se guardó junto con el ajuste de HU1.1 y HU1.2 (commit `e53a0d5`).
4. **Cinco issues en GitHub.** Uno por historia, con los criterios como casillas `- [ ]`. Cada issue se comparó con `docs/requisitos.md` y se aprobó por separado antes de crearlo.
5. **Revisiones del agente.** Se rechazaron o corrigieron varias propuestas (secciones 4 y 5). Antes de cada commit se verificaron los documentos.

## 3. Prompts principales

### 3.1 Prompts originales de la actividad

1. **Planeación:**
   > Vamos a planear Mini Inventario, una web donde una persona inicia sesión, registra productos con nombre, SKU, cantidad y cantidad mínima, y ve cuáles están por debajo del mínimo. No escribas código. Hazme preguntas sobre lo que no esté claro y luego propone 5 historias de usuario, cada una con criterios de aceptación que se puedan comprobar.

2. **Diseño técnico:**
   > Propón el diseño técnico de Mini Inventario y guárdalo en docs/diseno.md. Usa Node.js con Express para servir la página, HTML y JavaScript sin framework, y Supabase para base de datos e inicio de sesión. Define la tabla productos con id, user_id, nombre, sku, cantidad, minimo y created_at. Explica qué valida cada capa.

3. **Issues:**
   > Crea un issue en GitHub por cada historia de docs/requisitos.md usando gh. Pon los criterios de aceptación como lista de tareas. Muéstrame cada comando antes de ejecutarlo.

### 3.2 Prompts de corrección (fragmentos textuales)

- **Al rechazar el primer plan:**
  > La actividad del profesor establece que deben guardarse en `docs/requisitos.md`. Corrige esta ruta y evita crear documentos duplicados. […] Incorpora Node.js con Express, HTML y JavaScript sin framework, y Supabase para la base de datos y autenticación. […] Ajusta también el criterio HU1.7.
- **Organización de documentos:**
  > `docs/requisitos.md` debe contener las cinco historias de usuario con sus criterios de aceptación comprobables y las decisiones funcionales. `docs/diseno.md` debe ser un documento independiente. […] Antes de modificar archivos, utiliza la rama `dia-02-planeacion`. No abras todavía el pull request.
- **Al rechazar el primer borrador del diseño:**
  > Conserva la confirmación del correo electrónico en Supabase Auth. No la desactives únicamente para permitir el inicio de sesión inmediato. […] Explica cómo se realizarán los ajustes rápidos de cantidad de manera atómica con Supabase. Puedes utilizar una función PostgreSQL mediante RPC.
- **Ajustes finales del diseño:**
  > En la función public.ajustar_cantidad, revoca explícitamente los permisos de ejecución de PUBLIC y anon antes de conceder EXECUTE a authenticated. […] Configura la redirección a inventario.html y especifica que la página debe comprobar que Supabase haya establecido una sesión válida.

### 3.3 Prompts de verificación (fragmentos textuales)

- > Verifica que docs/requisitos.md contenga exactamente las 5 historias de usuario, sus 31 criterios de aceptación y las correcciones acordadas. Comprueba también que no haya información sensible ni archivos adicionales preparados.
- > Realiza la verificación mediante comandos sencillos e independientes, sin encadenarlos con && ni utilizar funciones de Bash.
- > Muéstrame el título, el contenido y el comando gh issue create de cada issue antes de ejecutarlo. Espera mi aprobación para cada uno. […] Comprueba que no existan issues duplicados antes de crear los nuevos.

## 4. Correcciones realizadas al agente

### Corrección 1: ruta del documento de requisitos

- **Problema:** el plan proponía guardar las historias en `docs/historias-de-usuario.md`.
- **Corrección:** se usa `docs/requisitos.md` como único documento de requisitos.
- **Motivo:** es la ruta que exige la actividad, y un solo archivo evita documentos duplicados o contradictorios.

### Corrección 2: separación de requisitos y diseño, y tecnologías

- **Problema:** el plan solo mencionaba Node.js 22 y Python 3.12, y mezclaba requisitos con arquitectura. Además, HU1.7 decía únicamente que la contraseña nunca se guarda en texto plano.
- **Corrección:**
  - los requisitos quedan en `docs/requisitos.md` y el diseño en `docs/diseno.md`;
  - el diseño precisa Node.js 22 con Express, HTML y JavaScript sin framework, y Supabase para la base de datos y la autenticación, con Python 3.12 solo para scripts;
  - HU1.7 indica que las contraseñas las gestiona Supabase Auth, sin almacenarlas en las tablas del proyecto.
- **Motivo:** son las tecnologías obligatorias de la actividad. Además, delegar las contraseñas en Supabase Auth evita almacenarlas manualmente y hace el criterio comprobable revisando nuestro propio esquema.

### Corrección 3: confirmación de correo en Supabase Auth

- **Problema:** el primer borrador del diseño proponía desactivar "Confirm email" en Supabase para que el registro iniciara sesión de inmediato.
- **Corrección:**
  - se mantiene la confirmación de correo activa;
  - HU1.1 ahora contempla la confirmación y la redirección a `inventario.html`, que comprueba que exista una sesión válida y, si no la hay, muestra el inicio de sesión;
  - HU1.2 ahora muestra el mismo mensaje tanto si el correo ya tiene cuenta como si no;
  - se añadió la decisión funcional correspondiente en `docs/requisitos.md`.
- **Motivo:** desactivar una medida de seguridad solo por comodidad no está justificado. Mantenerla evita cuentas con correos no verificados y no revela si una cuenta existe.

### Corrección 4: ajuste atómico de cantidades mediante RPC

- **Problema:** el primer borrador ya indicaba que el ajuste se haría con un único `UPDATE` atómico (`cantidad = cantidad + delta`), pero no definía cómo implementarlo desde Supabase de forma segura.
- **Corrección:** se documentó la función PostgreSQL `public.ajustar_cantidad`, llamada mediante RPC, con:
  - `security invoker`, para que se apliquen las políticas RLS;
  - validación explícita de propiedad (`user_id = auth.uid()`);
  - `delta` limitado a +1 o −1;
  - control de cantidades negativas mediante `check (cantidad >= 0)`;
  - `search_path` fijo;
  - permisos con `revoke` explícito a `public` y `anon` antes del `grant` a `authenticated`.
- **Motivo:** la base de datos garantiza la atomicidad, la propiedad del producto y la ausencia de cantidades negativas, incluso si alguien llama a Supabase sin pasar por Express.

## 5. Errores y propuestas incorrectas de la IA

1. **Ruta de documento distinta a la exigida.** El agente propuso `docs/historias-de-usuario.md`.
   - *Detección:* al revisar el plan antes de aprobarlo.
   - *Solución:* corrección 1.
2. **Desactivar la confirmación de correo.** El agente propuso desactivar "Confirm email" para cumplir literalmente HU1.1, en lugar de cuestionar el criterio.
   - *Detección:* al revisar el borrador de `docs/diseno.md`; se rechazó su creación.
   - *Solución:* corrección 3.
3. **Verificación incompleta.** Al comprobar los cambios de `docs/requisitos.md`, el filtro usado por el agente (`grep -E '^[-+][^-+]'`) ocultó la línea nueva de la decisión funcional, porque esa línea empieza por `- `.
   - *Detección:* el propio agente notó que faltaba en el resultado y lo informó.
   - *Solución:* se repitió la comprobación con `grep -n`, `git diff --numstat` y `git diff -- docs/requisitos.md`.
4. **Comando de verificación demasiado complejo.** El agente propuso un comando con varios `&&` y funciones de Bash, y el sistema de aprobación mostró "Parse error".
   - *Detección:* en la ventana de aprobación.
   - *Solución:* se rechazó el comando, y desde entonces las verificaciones se hacen con comandos simples e independientes.
5. **Comando no anunciado.** Al crear la rama, el agente incluyó `git switch main`, que no estaba en la lista de comandos aprobados. No tuvo efecto, porque ya se estaba en `main`.
   - *Detección:* el agente lo informó después de ejecutarlo.
   - *Lección:* anunciar todos los comandos antes de ejecutarlos.

## 6. Decisiones de aprobación

### Comandos aprobados

- **`git add docs/requisitos.md docs/diseno.md` y commit `e53a0d5`.**
  - *Qué hace:* prepara y guarda en la rama local los documentos de requisitos y diseño.
  - *Motivo de la aprobación:* antes se verificaron las 5 historias, los 31 criterios, las correcciones aplicadas, la ausencia de datos sensibles y que solo esos dos archivos estuvieran modificados.
- **Cada `gh issue create` (#3 a #7).** Cada issue se aprobó por separado después de comparar su título, su historia y sus criterios con `docs/requisitos.md`.

### Acciones rechazadas

- **Comando de verificación encadenado.** Se rechazó porque el sistema de aprobación mostró "Parse error" y no se podía revisar con seguridad (sección 5, error 4).
- **Primera creación de `docs/diseno.md`.** Se rechazó porque desactivaba la confirmación de correo (corrección 3).
- **Dos primeras solicitudes de aprobación del plan.** Se rechazaron hasta incorporar las correcciones 1 y 2 y la separación de documentos.

### Pendientes de autorización

- `git push` de la rama `dia-02-planeacion`.
- Apertura del pull request hacia `main`.

## 7. Evidencias verificables

### Documentos y commits

| Evidencia | Detalle |
|---|---|
| `docs/requisitos.md` | 5 historias y 31 criterios: HU1 = 7, HU2 = 6, HU3 = 7, HU4 = 6, HU5 = 5 |
| `docs/diseno.md` | Arquitectura, tabla `productos` con 7 campos, RLS, función `ajustar_cantidad`, flujo de confirmación de correo y validaciones por capa |
| Commit `00f05d0` | Agrega docs/requisitos.md con las historias de usuario |
| Commit `e53a0d5` | Agrega diseño técnico y ajusta requisitos de confirmación de correo |
| Rama `dia-02-planeacion` | Rama local; todavía no publicada en GitHub |

### Issues

| Issue | Historia | Criterios | Enlace |
|---|---|---|---|
| #3 | HU1 — Crear cuenta e iniciar sesión | 7 | https://github.com/JessBlack-GT/mini-inventario/issues/3 |
| #4 | HU2 — Registrar un producto | 6 | https://github.com/JessBlack-GT/mini-inventario/issues/4 |
| #5 | HU3 — Ver el inventario y los productos bajo mínimo | 7 | https://github.com/JessBlack-GT/mini-inventario/issues/5 |
| #6 | HU4 — Ajustar la cantidad rápidamente | 6 | https://github.com/JessBlack-GT/mini-inventario/issues/6 |
| #7 | HU5 — Editar y eliminar un producto | 5 | https://github.com/JessBlack-GT/mini-inventario/issues/7 |
| **Total** | **5 issues** | **31** | |

La numeración empieza en #3 porque GitHub comparte la numeración entre issues y pull requests, y los PR #1 y #2 corresponden al Día 1.

Cada issue termina con una referencia en texto al documento de origen (`docs/requisitos.md`), a la rama `dia-02-planeacion` y a `docs/diseno.md`. Esas referencias no son enlaces.

## 8. Resultados y verificación

### Verificaciones realizadas

- **Historias y criterios:** antes de cada commit se contaron con `grep` y `awk`. El resultado fue 5 historias y 31 criterios.
- **`docs/requisitos.md`:** `git diff -- docs/requisitos.md` mostró solo los cambios aprobados en HU1.1, HU1.2 y la decisión funcional de confirmación de correo.
- **`docs/diseno.md`:** se comprobó con `grep` la presencia de:
  - RLS con cuatro políticas;
  - `security invoker` y la comprobación de propiedad;
  - `delta` limitado a ±1 y `check (cantidad >= 0)`;
  - `revoke` antes de `grant`;
  - la redirección a `inventario.html` y la validación de sesión con `getUser()`.
- **Archivos preparados:** antes de cada commit, `git diff --cached --name-only` mostró únicamente los archivos autorizados.
- **Issues:**
  - antes de crearlos, `gh issue list --state all` confirmó que no existían issues;
  - `diff` confirmó que el texto de los 31 criterios era idéntico al de `docs/requisitos.md`;
  - después de crearlos, `gh issue view` confirmó que los cinco están abiertos y tienen 7, 6, 7, 6 y 5 casillas, en total 31.

### Estado actual

- **Aplicación:** todavía no se ha implementado. No existe código de Express, HTML, JavaScript ni Supabase; solo los documentos de planeación.
- **`git push` y pull request:** el push de `dia-02-planeacion` y el pull request hacia `main` están pendientes de autorización.
- **Capturas:** este día no incluye capturas de pantalla.
