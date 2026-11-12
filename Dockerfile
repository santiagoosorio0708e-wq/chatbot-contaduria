FROM node:20-alpine

WORKDIR /app

# Instalar dependencias de producción y aplicar parche de Baileys
COPY package*.json fix-baileys.js ./
RUN npm install --omit=dev

# Copiar el código fuente
COPY . .

# Directorio de persistencia para credenciales de WhatsApp (Baileys)
RUN mkdir -p auth_info

# Puerto expuesto por defecto
EXPOSE 3000

# Arrancar la aplicación
CMD ["npm", "start"]
