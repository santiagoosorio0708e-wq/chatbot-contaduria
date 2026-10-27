FROM node:20-slim

# Evitar descargar Chromium duplicado durante 'npm install' y fijar la ruta oficial de Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production

# Instalar dependencias del sistema, dumb-init y Google Chrome Stable directamente vía .deb (evita fallos de repositorios apt de Google)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    gnupg \
    ca-certificates \
    dumb-init \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y --no-install-recommends ./google-chrome-stable_current_amd64.deb \
    && rm -f google-chrome-stable_current_amd64.deb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias del proyecto (omitiendo devDependencies para reducir tamaño y huella en RAM)
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el código fuente
COPY . .

# Crear directorios para sesiones con permisos adecuados
RUN mkdir -p .wwebjs_auth .wwebjs_cache

# Puerto por defecto (Render inyecta su propia variable PORT)
EXPOSE 3000

# Usar dumb-init como PID 1 para manejar señales correctamente (evita procesos zombies de Chrome en Render)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Arrancar la aplicación con el límite de memoria optimizado
CMD ["npm", "start"]
