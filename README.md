# mini-inventario

Proyecto sencillo de gestión de inventario.

## Requisitos

- [Node.js](https://nodejs.org/) 22
- [Python](https://www.python.org/) 3.12

## Cómo ejecutar

```bash
npm install
npm start        # http://localhost:3000 (o el puerto de la variable PORT)
npm test
```

- `GET /health` responde `{ "status": "ok" }`.
- Por ahora los productos se guardan en el `localStorage` del navegador; todo el acceso a datos está en `public/productos.js`.
