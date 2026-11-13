# Requisitos — Mini Inventario

Mini Inventario es una web donde una persona inicia sesión, registra productos (nombre, SKU, cantidad y cantidad mínima) y ve cuáles están por debajo del mínimo.

La arquitectura y las tecnologías (Express, HTML y JavaScript sin framework, Supabase, tabla `productos` y validaciones técnicas) se documentan aparte, en `docs/diseno.md`.

## Decisiones funcionales

- **Cuentas:** registro abierto con correo y contraseña. Cada cuenta ve y modifica **solo su propio inventario**.
- **Acciones sobre productos:** crear, editar, eliminar (con confirmación), ajustar la cantidad rápidamente (+/−) y buscar o filtrar.
- **SKU:** único dentro de cada inventario, sin distinguir mayúsculas (`ab-1` equivale a `AB-1`). Dos cuentas distintas pueden usar el mismo SKU.
- **Bajo mínimo:** un producto está bajo mínimo solo si `cantidad < cantidad mínima`. Si la cantidad es igual al mínimo, **no** está bajo mínimo.
- **Contraseñas:** las gestiona Supabase Auth. Nunca se almacenan en las tablas del proyecto.
- **Confirmación de correo:** activa en Supabase Auth. Una cuenta nueva solo puede iniciar sesión después de abrir el enlace de confirmación, que lleva a la página de inventario únicamente si Supabase establece una sesión válida. Los mensajes de registro no revelan si un correo ya tiene cuenta.

## Supuestos

- Contraseña de al menos 8 caracteres; correo con formato válido y no registrado previamente.
- Nombre obligatorio, de 1 a 100 caracteres.
- SKU obligatorio, de 1 a 50 caracteres, sin espacios al inicio ni al final.
- Cantidad y cantidad mínima: números enteros mayores o iguales a 0.
- El SKU puede editarse, pero debe seguir siendo único.

## Historias de usuario

### HU1 — Crear cuenta e iniciar sesión

**Como** persona que gestiona un inventario, **quiero** crear una cuenta e iniciar sesión, **para** que solo yo vea y modifique mis productos.

Criterios de aceptación:

1. Con un correo nuevo y una contraseña de 8 o más caracteres, el registro crea la cuenta **sin iniciar sesión** y muestra "Si el correo es válido, recibirás un enlace para confirmar tu cuenta". Hasta abrir ese enlace, iniciar sesión no da acceso al inventario y muestra "Confirma tu correo antes de iniciar sesión". Al abrir el enlace se llega a la página de inventario con la sesión iniciada; si el enlace no produce una sesión válida (por ejemplo, porque expiró o ya se usó), se muestra el inicio de sesión.
2. Registrarse con un correo que ya tiene cuenta muestra **exactamente el mismo mensaje** que un registro nuevo, no crea una segunda cuenta y no cambia la contraseña de la existente. Se comprueba comparando la respuesta de ambos casos en el navegador y verificando en Supabase Auth que solo hay una cuenta con ese correo.
3. Una contraseña de menos de 8 caracteres o un correo sin formato válido muestra un error en el campo y no crea la cuenta.
4. Iniciar sesión con credenciales correctas lleva a la página de inventario; con credenciales incorrectas muestra "Correo o contraseña incorrectos", sin indicar cuál dato falló.
5. Al cerrar sesión, entrar a la página de inventario redirige al inicio de sesión.
6. Sin sesión, ninguna página ni operación de productos es accesible (redirige al inicio de sesión o responde 401).
7. Las contraseñas las gestiona exclusivamente Supabase Auth: ninguna tabla propia del proyecto tiene una columna de contraseña y el backend no la guarda ni la registra en logs. Se comprueba revisando el esquema de las tablas en Supabase y los logs del servidor después de un registro.

### HU2 — Registrar un producto

**Como** persona con sesión iniciada, **quiero** registrar un producto con nombre, SKU, cantidad y cantidad mínima, **para** llevar el control de mi inventario.

Criterios de aceptación:

1. Con datos válidos (por ejemplo "Tornillo M4", `TOR-M4`, 50, 20), el producto aparece en la lista con esos cuatro valores.
2. Si falta el nombre o el SKU, se muestra un error en ese campo y no se guarda nada.
3. Una cantidad o una cantidad mínima negativa, decimal o no numérica muestra un error y no se guarda.
4. Registrar un SKU que ya existe en mi inventario, aunque tenga otras mayúsculas (`tor-m4`), muestra "El SKU ya existe" y no se guarda.
5. Otra cuenta sí puede registrar el mismo SKU `TOR-M4` en su propio inventario.
6. Después de recargar la página, o de cerrar sesión y volver a iniciarla, el producto sigue guardado.

### HU3 — Ver el inventario y los productos bajo mínimo

**Como** persona con sesión iniciada, **quiero** ver mis productos, distinguir los que están por debajo del mínimo y buscarlos, **para** saber qué debo reponer.

Criterios de aceptación:

1. La lista muestra solo los productos de mi cuenta, con nombre, SKU, cantidad y cantidad mínima.
2. Un producto con cantidad 5 y mínimo 10 aparece marcado como "Bajo mínimo".
3. Un producto con cantidad 10 y mínimo 10 **no** aparece marcado; con cantidad 11 tampoco.
4. Hay un contador visible con el número de productos bajo mínimo (por ejemplo "2 productos bajo mínimo").
5. El filtro "Solo bajo mínimo" muestra exclusivamente los productos marcados.
6. Al escribir "torn" en el buscador se muestran los productos cuyo nombre o SKU contiene ese texto, sin distinguir mayúsculas.
7. Sin productos, se muestra "Aún no tienes productos" con acceso para registrar uno; si la búsqueda no encuentra nada, se muestra "Sin resultados".

### HU4 — Ajustar la cantidad rápidamente

**Como** persona con sesión iniciada, **quiero** sumar o restar unidades desde la lista, **para** registrar entradas y salidas sin abrir el formulario completo.

Criterios de aceptación:

1. Pulsar "+" sobre un producto con cantidad 5 la cambia a 6, y el cambio persiste al recargar.
2. Pulsar "−" sobre un producto con cantidad 5 la cambia a 4.
3. Con cantidad 0, el botón "−" está deshabilitado o el intento muestra un error; la cantidad nunca queda negativa.
4. Si un ajuste deja la cantidad por debajo del mínimo (de 10 a 9 con mínimo 10), la marca "Bajo mínimo" y el contador se actualizan sin recargar la página.
5. Si un ajuste deja la cantidad igual o por encima del mínimo, la marca desaparece y el contador disminuye.
6. No es posible ajustar productos de otra cuenta (la operación responde 403 o 404).

### HU5 — Editar y eliminar un producto

**Como** persona con sesión iniciada, **quiero** corregir los datos de un producto o eliminarlo, **para** mantener el inventario al día.

Criterios de aceptación:

1. Editar nombre, SKU, cantidad o cantidad mínima con datos válidos guarda los cambios y se reflejan en la lista, incluida la marca "Bajo mínimo".
2. Al editar se aplican las mismas validaciones que en HU2; cambiar el SKU por uno que ya tiene otro producto de mi inventario muestra "El SKU ya existe".
3. Al pulsar "Eliminar" aparece una confirmación con el nombre del producto; si cancelo, el producto sigue en la lista.
4. Si confirmo, el producto desaparece de la lista, del contador de bajo mínimo y de las búsquedas, también después de recargar.
5. No es posible editar ni eliminar productos de otra cuenta (la operación responde 403 o 404).

## Fuera de alcance (por ahora)

Recuperación de contraseña, inventarios compartidos o roles, historial de movimientos, notificaciones por correo, importación o exportación CSV y despliegue (que, según `CLAUDE.md`, requiere aprobación previa).

## Datos para comprobar los criterios

Se usan dos cuentas de prueba (A y B) y estos productos en la cuenta A:

| SKU | Cantidad | Mínimo | Resultado esperado |
|---|---|---|---|
| `TOR-M4` | 5 | 10 | Bajo mínimo |
| `TUE-M4` | 10 | 10 | No bajo mínimo (caso límite) |
| `ARA-M4` | 0 | 3 | Bajo mínimo y botón "−" bloqueado |

La cuenta B se usa para comprobar que cada inventario está aislado (HU1.6, HU2.5, HU4.6 y HU5.5).
