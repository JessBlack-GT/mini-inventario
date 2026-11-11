# Mini Inventario

Mini Inventario es una aplicación web para gestionar inventario.

## Entorno
- Node.js 22
- Python 3.12

## Flujo de trabajo
- Cada cambio va en su propia rama, nunca directamente en `main`.
- Todo cambio se integra mediante un pull request.

## Seguridad
- Nunca subas llaves, tokens, contraseñas ni archivos `.env` al repositorio.
- Antes de hacer commit, revisa que no haya secretos en los archivos preparados.

## Requiere aprobación previa
- Borrar datos (registros, bases de datos, archivos o ramas).
- Desplegar a cualquier entorno.
