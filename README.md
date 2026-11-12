<div id="top"></div>

<!-- BANNER PRINCIPAL CENTRADO -->
<div align="center">

  # 📊 Chatbot de Contaduría Pública 🤖
  
  **Asistente Virtual Inteligente para WhatsApp con Google Gemini AI y Baileys**
  
  <p align="center">
    Atención tributaria y contable colombiana 24/7 con vinculación por Código de 8 dígitos o QR, control estricto de horarios y ultra bajo consumo de memoria RAM (<50MB) para Render Free Tier.
  </p>

  <!-- BADGES / INSIGNIAS SHIELDS.IO -->
  <p align="center">
    <a href="https://github.com/santiagoosorio0708e-wq/chatbot-contaduria/stargazers">
      <img src="https://img.shields.io/github/stars/santiagoosorio0708e-wq/chatbot-contaduria?style=for-the-badge&logo=github&color=38bdf8" alt="GitHub Stars" />
    </a>
    <a href="https://github.com/santiagoosorio0708e-wq/chatbot-contaduria/network/members">
      <img src="https://img.shields.io/github/forks/santiagoosorio0708e-wq/chatbot-contaduria?style=for-the-badge&logo=github&color=818cf8" alt="GitHub Forks" />
    </a>
    <a href="https://github.com/santiagoosorio0708e-wq/chatbot-contaduria/issues">
      <img src="https://img.shields.io/github/issues/santiagoosorio0708e-wq/chatbot-contaduria?style=for-the-badge&logo=github&color=f43f5e" alt="GitHub Issues" />
    </a>
    <img src="https://img.shields.io/badge/Licencia-ISC-green?style=for-the-badge" alt="Licencia" />
    <img src="https://img.shields.io/badge/Node.js-v20-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Render-Free_Tier_Ready-46E3B7?style=for-the-badge&logo=render&logoColor=white" alt="Render" />
    <img src="https://img.shields.io/badge/RAM-Ultra_Low_(~45MB)-blue?style=for-the-badge" alt="RAM" />
    <img src="https://img.shields.io/badge/Gemini_AI-2.5_Flash-8E75C2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI" />
  </p>

</div>

---

<!-- TABLA DE CONTENIDOS INTERACTIVA -->
<details open>
  <summary><strong>📑 Tabla de Contenidos</strong></summary>
  <ol>
    <li><a href="#-acerca-del-proyecto">Acerca del Proyecto</a></li>
    <li><a href="#-construido-con">Construido con</a></li>
    <li><a href="#-arquitectura-del-sistema">Arquitectura del Sistema</a></li>
    <li><a href="#-prerrequisitos">Prerrequisitos</a></li>
    <li><a href="#-instalación">Instalación</a></li>
    <li><a href="#-uso-y-características">Uso y Características</a></li>
    <li><a href="#-despliegue-en-render-247">Despliegue en Render (24/7 Gratis)</a></li>
    <li><a href="#-pruebas">Pruebas</a></li>
    <li><a href="#-hoja-de-ruta">Hoja de Ruta (Roadmap)</a></li>
    <li><a href="#-contacto">Contacto</a></li>
  </ol>
</details>

---

## 📖 Acerca del Proyecto

El **Chatbot de Contaduría Pública** es una solución conversacional diseñada especialmente para despachos contables y contadores públicos independientes en Colombia. Integra la biblioteca ligera **@whiskeysockets/baileys** con los modelos generativos de **Google Gemini** para responder consultas tributarias, presentar el portafolio de servicios y realizar derivación inteligente (*handoff*) a la contadora cuando el cliente requiere atención personalizada.

A diferencia de las soluciones basadas en navegadores pesados (Puppeteer/Chromium) que consumen más de 500MB de RAM y colapsan en planes gratuitos, este bot opera mediante el protocolo directo WebSocket de WhatsApp, consumiendo **menos de 50MB de memoria RAM**, permitiendo una ejecución estable, rápida y 100% gratuita en plataformas como **Render**.

### 🌟 Capacidades Clave:
* **Doble Método de Vinculación:** Vinculación por **Código de 8 dígitos** en WhatsApp (sin necesidad de cámara o escaneo QR) o mediante **Código QR** dinámico.
* **Ultra Bajo Consumo de RAM:** ~45MB en tiempo de ejecución (menos del 10% del límite de 512MB de Render Free Tier).
* **Asesoría Especializada:** Entrenado en normativa fiscal colombiana (DIAN, Declaración de Renta, Información Exógena, Revisoría Fiscal, Saldos a Favor).
* **Control de Horarios Laborales:** Gestión de jornadas (Mañana: 8:30 a 12:30 | Tarde: 14:00 a 18:00) con mensajes automáticos fuera de horario y protección anti-spam (*cooldown*).
* **Transferencia a Asesor Humano:** Detección automática de solicitud de atención directa para silenciar el bot y permitir que la contadora continúe la conversación.
* **Panel Web & Healthcheck:** Servidor HTTP integrado para monitoreo de salud (`/health`) y panel visual (`/qr` y `/`).

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🛠 Construido con

Este proyecto está construido con un stack de tecnologías optimizado para rendimiento y mínimo consumo de recursos:

* [![Node.js][node-badge]][node-url] - Entorno de ejecución en JavaScript (v20+ ESM).
* [![Baileys][baileys-badge]][baileys-url] - Cliente de WhatsApp directo vía WebSocket (Sin navegador, ultra ligero).
* [![Google Generative AI][gemini-badge]][gemini-url] - SDK oficial de Gemini para modelos generativos.
* [![Docker][docker-badge]][docker-url] - Imagen basada en Alpine Linux (~120MB en disco, cero dependencias GUI).
* [![Bottleneck][bottleneck-badge]][bottleneck-url] - Limitador de tasa (*Rate Limiter*) para proteger la cuota gratuita de la API.
* [![Luxon][luxon-badge]][luxon-url] - Manejo robusto de fechas y zonas horarias (`America/Bogota`).

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🏗 Arquitectura del Sistema

Estructura modular del proyecto con separación de responsabilidades:

```
chatbot-contador/
├── .dockerignore              # Archivos excluidos del contenedor Docker
├── .env.example               # Plantilla de variables de entorno seguras
├── .gitignore                 # Reglas de exclusión de Git (claves y sesiones)
├── Dockerfile                 # Imagen Docker ultra ligera basada en Node Alpine
├── docker-compose.yml         # Orquestación local simplificada
├── index.js                   # Punto de entrada principal (Servidor Web + Baileys + Shutdown)
├── package.json               # Manifiesto de dependencias ESM y scripts de ejecución
├── render.yaml                # Especificación Blueprint para despliegue en Render
├── list_models.js             # Utilidad para verificar modelos disponibles en Gemini
├── test.js                    # Prueba unitaria de generación con Gemini
├── test_all.js                # Prueba de latencia con múltiples modelos de IA
├── test_security.js           # Suite de pruebas de seguridad (Anti-Prototype Pollution, XSS, etc.)
├── test_server.js             # Suite de pruebas del Servidor HTTP y Healthchecks
├── test_schedule.js           # Suite de pruebas del validador de horarios laborales
├── config/
│   ├── accounting_services_context.md  # Información del despacho, tarifas y servicios contables
│   └── schedule.json          # Horarios de atención y mensaje de fuera de jornada
└── src/
    ├── config/
    │   └── index.js           # Carga, validación estricta y variables de entorno
    ├── server.js              # Servidor HTTP: /health, /status, /qr, CSP y Rate Limiting
    ├── services/
    │   ├── gemini.js          # Conexión con Gemini AI, sesiones en memoria y fallback
    │   └── whatsapp.js        # Cliente Baileys con soporte para Pairing Code y QR
    └── utils/
        ├── hours.js           # Validador de horarios con Luxon (Zona horaria Bogotá)
        └── security.js        # Seguridad: Safe JSON, Sanitización y ofuscación de claves
```

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 📋 Prerrequisitos

Antes de iniciar, asegúrate de contar con lo siguiente:

1. **Node.js** v20 o superior instalado en tu máquina.
2. Una **Clave de API de Google Gemini** ([Obtén tu clave gratis en Google AI Studio](https://aistudio.google.com/)).
3. Un teléfono móvil con WhatsApp instalado para vincular (mediante código de 8 dígitos o código QR).
4. Una cuenta gratuita en [Render.com](https://render.com/) para el despliegue en la nube.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🚀 Instalación

Sigue estos pasos para ejecutar el bot de forma local:

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/santiagoosorio0708e-wq/chatbot-contaduria.git
   cd chatbot-contaduria
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar las variables de entorno:**
   Copia el archivo de ejemplo y crea tu archivo `.env`:
   ```bash
   cp .env.example .env
   ```
   Abre `.env` y agrega tu API Key de Gemini:
   ```env
   GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"
   PORT=3000
   TIMEZONE="America/Bogota"
   USE_PAIRING_CODE=false
   PHONE_NUMBER=
   ```

4. **Ejecutar el bot:**
   ```bash
   npm start
   ```

5. **Vincular WhatsApp:**
   * **Opción QR:** Escanea el código que aparece en la terminal o abre `http://localhost:3000/qr` en tu navegador.
   * **Opción Código de Teléfono:** Si configuras `USE_PAIRING_CODE=true` y tu `PHONE_NUMBER=573001234567`, el bot te dará un código de 8 dígitos para escribir en WhatsApp > *Dispositivos vinculados* > *Vincular con el número de teléfono*.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## ⚡ Uso y Características

### 1. Panel Web y Endpoints
* **`GET /` o `/qr`**: Interfaz visual moderna para monitorear el estado, visualizar el código QR o el código de vinculación telefónica.
* **`GET /health`**: Endpoint ligero de monitoreo HTTP 200 para sondas de Render, balanceadores y monitores de tiempo de actividad.
* **`GET /status`**: Retorna el estado en formato JSON estructurado (`initializing`, `qr_ready`, `pairing_code_ready`, `ready`, `disconnected`).

### 2. Reglas Estrictas del Bot
* **Una Sola Respuesta por Mensaje:** El bot responde con precisión una sola vez por cada mensaje recibido del cliente, evitando bucles infinitos.
* **Filtro de Mensajes Previos:** Al conectarse, ignora automáticamente mensajes antiguos recibidos antes del arranque.
* **Exclusión de Grupos:** El bot únicamente atiende en chats individuales directos, ignorando grupos y estados.
* **Control Anti-Spam Fuera de Horario:** Si un usuario envía múltiples mensajes fuera de jornada, solo recibe la notificación una vez por hora (*cooldown* de 60 minutos).

### 3. Comandos Administrativos
* **`/reactivar`**: Si un chat fue derivado a la contadora (silenciado para atención humana), enviar este comando reactiva las respuestas automáticas de la IA en ese chat.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🌐 Despliegue en Render (24/7 Gratis)

Gracias a la migración a **Baileys**, el bot consume solo ~45MB de RAM, funcionando permanentemente sin cierres por falta de memoria (*OOM*):

### Opción A: Despliegue con Blueprint (`render.yaml`)
1. Sube tus cambios a GitHub (`git push origin main`).
2. Entra a [Render Dashboard](https://dashboard.render.com/) y selecciona **Blueprints** > **New Blueprint Instance**.
3. Conecta este repositorio; Render detectará la configuración de [`render.yaml`](file:///c:/Users/osori/Desktop/trabajos%20de%20campus/chatbot-contador/render.yaml).
4. Introduce tu variable `GEMINI_API_KEY` cuando te lo solicite y confirma el despliegue.

### Opción B: Despliegue Manual como Web Service
1. En Render, presiona **New +** y selecciona **Web Service**.
2. Conecta tu repositorio de GitHub.
3. Configura:
   * **Runtime:** `Docker` (o `Node` con Build Command `npm install` y Start Command `npm start`)
   * **Plan:** `Free`
   * **Health Check Path:** `/health`
4. En **Environment Variables**, añade:
   * `GEMINI_API_KEY`: Tu clave privada de Google Gemini.
   * `PORT`: `3000`
   * `TIMEZONE`: `America/Bogota`
   * `USE_PAIRING_CODE`: `false` (o `true` si prefieres código de 8 dígitos)
   * `PHONE_NUMBER`: (Opcional si usas pairing code, ej: `573001234567`)
5. Haz clic en **Deploy Web Service**.
6. Abre `https://tu-servicio.onrender.com/qr` en tu navegador y vincula tu WhatsApp.

### 🔄 Mantener el Bot Activo 24/7
El plan gratuito de Render suspende los servicios tras 15 minutos sin tráfico HTTP. Para mantenerlo activo 24/7:
1. Regístrate gratis en [Cron-Job.org](https://cron-job.org/) o [UptimeRobot](https://uptimerobot.com/).
2. Crea un cron job o monitor HTTP apuntando a `https://tu-servicio.onrender.com/health`.
3. Configúralo para enviar una petición cada **5 a 10 minutos**.
4. ¡El bot se mantendrá encendido y respondiendo las 24 horas del día sin ningún costo!

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🧪 Pruebas

El proyecto cuenta con suites de pruebas automatizadas:

* **Ejecutar todas las pruebas:**
  ```bash
  npm test
  ```
* **Pruebas de Seguridad (Anti-Prototype Pollution, Sanitización, Ofuscación):**
  ```bash
  npm run test:security
  ```
* **Pruebas de Control de Horarios:**
  ```bash
  npm run test:schedule
  ```
* **Pruebas del Servidor HTTP y Healthchecks:**
  ```bash
  npm run test:server
  ```

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🗺 Hoja de Ruta (Roadmap)

- [x] Migración completa a `@whiskeysockets/baileys` para eliminar Puppeteer/Chromium.
- [x] Reducción drástica del consumo de memoria RAM de >550MB a <50MB.
- [x] Soporte dual de vinculación: Código de 8 dígitos (Pairing Code) y Código QR visual.
- [x] Panel de monitoreo web `/qr` y `/health` con encabezados de seguridad CSP y Rate Limiting.
- [x] Control flexible de horarios laborales (jornadas de mañana y tarde en Colombia).
- [x] Detección de solicitud de asesor humano (*Handoff*) y comando `/reactivar`.
- [x] Dockerfile ultra ligero basado en Alpine Linux.
- [x] Pruebas automatizadas de seguridad, horarios y servidor HTTP con 100% de cobertura.
- [ ] Transcripción de audios con Gemini Multimodal.
- [ ] Integración de calendario para agendamiento directo de citas con Google Calendar.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 📬 Contacto

**Santiago Osorio**  
Repositorio del Proyecto: [https://github.com/santiagoosorio0708e-wq/chatbot-contaduria](https://github.com/santiagoosorio0708e-wq/chatbot-contaduria)

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[node-badge]: https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white
[node-url]: https://nodejs.org/
[baileys-badge]: https://img.shields.io/badge/Baileys_WS-25D366?style=flat&logo=whatsapp&logoColor=white
[baileys-url]: https://github.com/WhiskeySockets/Baileys
[gemini-badge]: https://img.shields.io/badge/Google_Gemini-8E75C2?style=flat&logo=google&logoColor=white
[gemini-url]: https://ai.google.dev/
[docker-badge]: https://img.shields.io/badge/Docker-Alpine-2496ED?style=flat&logo=docker&logoColor=white
[docker-url]: https://www.docker.com/
[bottleneck-badge]: https://img.shields.io/badge/Bottleneck-F59E0B?style=flat
[bottleneck-url]: https://github.com/SGrondin/bottleneck
[luxon-badge]: https://img.shields.io/badge/Luxon-Timezone-blue?style=flat
[luxon-url]: https://moment.github.io/luxon/
