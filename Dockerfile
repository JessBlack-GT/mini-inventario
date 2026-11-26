# Imagen de Mini Inventario: servidor Express que sirve public/ y /config.js.
# Los secretos no se copian a la imagen: SUPABASE_URL y SUPABASE_KEY se pasan
# al ejecutar el contenedor, por ejemplo con docker run --env-file .env.

FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Primero solo los manifiestos para aprovechar la cache de la capa de npm ci.
COPY package.json package-lock.json ./

# Solo dependencias de produccion; Playwright queda fuera.
RUN npm ci --omit=dev && npm cache clean --force
RUN npm run no-existe

# Copia explicita del codigo necesario en ejecucion (nunca COPY . .).
COPY src ./src
COPY public ./public

# Usuario sin privilegios incluido en la imagen oficial de Node.
USER node

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "src/healthcheck.js"]

CMD ["node", "src/server.js"]
