"""Servidor MCP de solo lectura para Mini Inventario.

Expone dos herramientas sobre public.productos:
  - buscar_producto(nombre): productos cuyo nombre contiene el texto dado.
  - stock_bajo(): productos con cantidad < minimo (mismo criterio que la app).

Seguridad:
  - DATABASE_URL se lee de mcp-inventario/.env y nunca se imprime ni se incluye en errores.
  - Solo consultas fijas y parametrizadas; ninguna herramienta acepta SQL libre ni escribe datos.
  - Cada conexión se abre en modo de solo lectura (además, el rol inventario_lector solo tiene SELECT).
  - Como máximo 50 resultados por llamada.
  - Con transporte stdio, stdout es el canal del protocolo: el servidor no escribe nada en él.
"""

from pathlib import Path
from typing import Any

import psycopg
from dotenv import dotenv_values
from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from psycopg.rows import dict_row

MAX_RESULTADOS = 50
MAX_LARGO_NOMBRE = 100
COLUMNAS = "nombre, sku, cantidad, minimo"

# dotenv_values no copia la variable al entorno del proceso: solo queda en esta constante.
_DATABASE_URL = dotenv_values(Path(__file__).resolve().parent / ".env").get("DATABASE_URL") or ""
if not _DATABASE_URL:
    raise SystemExit("Falta DATABASE_URL en mcp-inventario/.env")

mcp = FastMCP("inventario")
SOLO_LECTURA = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)


def _consultar(sql: str, parametros: tuple[Any, ...]) -> dict[str, Any]:
    """Ejecuta una consulta fija de solo lectura y devuelve como máximo MAX_RESULTADOS filas."""
    try:
        with psycopg.connect(_DATABASE_URL, connect_timeout=10, row_factory=dict_row) as conexion:
            conexion.read_only = True
            filas = conexion.execute(sql, parametros).fetchall()
    except psycopg.Error as error:
        # El mensaje original puede incluir el usuario o el host de la conexión: no se reenvía.
        raise RuntimeError(f"No se pudo consultar el inventario ({type(error).__name__}).") from None
    # Se piden MAX_RESULTADOS + 1 filas solo para saber si había más.
    return {
        "productos": filas[:MAX_RESULTADOS],
        "total_devuelto": min(len(filas), MAX_RESULTADOS),
        "hay_mas": len(filas) > MAX_RESULTADOS,
    }


def _escapar_like(texto: str) -> str:
    """Hace que %, _ y \\ se busquen literalmente dentro de ILIKE."""
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@mcp.tool(annotations=SOLO_LECTURA)
def buscar_producto(nombre: str) -> dict[str, Any]:
    """Busca productos cuyo nombre contenga el texto indicado (sin distinguir mayúsculas).

    Devuelve nombre, sku, cantidad y mínimo de hasta 50 productos, ordenados por nombre.
    """
    texto = (nombre or "").strip()
    if not texto:
        raise ValueError("Indica un nombre o parte de un nombre.")
    if len(texto) > MAX_LARGO_NOMBRE:
        raise ValueError(f"El nombre no puede superar {MAX_LARGO_NOMBRE} caracteres.")
    sql = (
        f"select {COLUMNAS} from public.productos "
        "where nombre ilike %s escape '\\' "
        "order by nombre, sku limit %s"
    )
    return _consultar(sql, (f"%{_escapar_like(texto)}%", MAX_RESULTADOS + 1))


@mcp.tool(annotations=SOLO_LECTURA)
def stock_bajo() -> dict[str, Any]:
    """Lista los productos bajo el mínimo (cantidad < mínimo; igual al mínimo no cuenta).

    Devuelve hasta 50 productos, primero los que tienen mayor faltante.
    """
    sql = (
        f"select {COLUMNAS}, minimo - cantidad as faltante from public.productos "
        "where cantidad < minimo "
        "order by minimo - cantidad desc, nombre limit %s"
    )
    return _consultar(sql, (MAX_RESULTADOS + 1,))


if __name__ == "__main__":
    mcp.run()
