<div id="top"></div>

<!-- BANNER PRINCIPAL CENTRADO -->
<div align="center">

  # 🤖 Chatbot de Contaduría Pública 📊
  
  **Asistente Virtual Inteligente con WhatsApp Web y Google Gemini AI**
  
  <p align="center">
    Automatización de atención al cliente, respuestas tributarias colombianas y derivación a asesor humano en tiempo real.
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
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
    <img src="https://img.shields.io/badge/Render-Deployed-46E3B7?style=for-the-badge&logo=render&logoColor=white" alt="Render" />
    <img src="https://img.shields.io/badge/Gemini_AI-3.5_Flash_Lite-8E75C2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI" />
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
    <li><a href="#-despliegue-en-render-247">Despliegue en Render (24/7)</a></li>
    <li><a href="#-pruebas">Pruebas</a></li>
    <li><a href="#-hoja-de-ruta">Hoja de Ruta (Roadmap)</a></li>
    <li><a href="#-contacto">Contacto</a></li>
  </ol>
</details>

---

## 📖 Acerca del Proyecto

El **Chatbot de Contaduría Pública** es una solución conversacional diseñada para firmas contables y contadores públicos independientes en Colombia. Integra la biblioteca **whatsapp-web.js** con los modelos generativos de lenguaje de **Google Gemini** para responder consultas tributarias, presentar el portafolio de servicios y realizar derivación inteligente (*handoff*) a la contadora cuando el cliente requiere atención personalizada.

### 🌟 Capacidades Clave:
* **Asesoría Especializada:** Entrenado en normativa fiscal y tributaria colombiana (DIAN, Exógena, Renta, Revisoría Fiscal).
* **Gestión de Horarios:** Respuestas automáticas fuera de la jornada laboral respetando la zona horaria de Colombia (`America/Bogota`).
* **Handoff a Humano:** Detección de intención mediante llamadas a funciones (*Function Calling*) de Gemini para transferir el chat y silenciar el bot.
* **Panel Web & QR Visual:** Servidor HTTP integrado para monitoreo de salud (`/health`) y escaneo visual de código QR (`/qr`).
* **Listo para la Nube:** Empaquetado en Docker optimizado para **Render**.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🛠 Construido con

Este proyecto está construido con un stack moderno de tecnologías robustas:

* [![Node.js][node-badge]][node-url] - Entorno de ejecución para JavaScript del lado del servidor.
* [![WhatsApp Web.js][wa-badge]][wa-url] - Cliente de WhatsApp Web a través de Puppeteer.
* [![Google Generative AI][gemini-badge]][gemini-url] - SDK oficial de Gemini para modelos de lenguaje.
* [![Docker][docker-badge]][docker-url] - Contenedorización con Google Chrome Stable y dependencias de Linux.
* [![Bottleneck][bottleneck-badge]][bottleneck-url] - Limitador de tasa (*Rate Limiter*) para evitar saturación de API.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🏗 Arquitectura del Sistema

Estructura modular del proyecto con separación de responsabilidades:

```
chatbot-contador/
├── .dockerignore              # Archivos excluidos del contenedor Docker
├── .env.example               # Plantilla de variables de entorno seguras
├── .gitignore                 # Reglas de exclusión de Git (claves y sesiones)
├── Dockerfile                 # Imagen Docker con Chrome Headless oficial
├── index.js                   # Punto de entrada principal (Web + WhatsApp)
├── package.json               # Manifiesto de dependencias y scripts
├── render.yaml                # Especificación Blueprint para despliegue en Render
├── list_models.js             # Utilidad para consultar modelos de Gemini disponibles
├── test.js                    # Prueba unitaria del servicio Gemini
├── test_all.js                # Prueba comparativa de latencia en modelos
└── src/
    ├── config/
    │   └── index.js           # Carga y validación estricta de variables de entorno
    ├── server.js              # Servidor HTTP: /health, /status y panel visual /qr
    ├── services/
    │   ├── gemini.js          # Integración de IA, Function Calling y Bottleneck
    │   └── whatsapp.js        # Cliente de WhatsApp, filtros, estados y eventos
    └── utils/
        └── hours.js           # Validador de horario laboral (Bogotá UTC-5)
```

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 📋 Prerrequisitos

Antes de iniciar, asegúrate de contar con lo siguiente:

1. **Node.js** v18 o superior instalado en tu máquina.
2. Una **Clave de API de Google Gemini** ([Obtener en Google AI Studio](https://aistudio.google.com/)).
3. Un teléfono móvil con WhatsApp instalado y conexión a internet para escanear el código QR.
4. Una cuenta gratuita en [Render.com](https://render.com/) (para el despliegue en la nube).

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
   Copia el archivo de ejemplo y edita tus valores:
   ```bash
   cp .env.example .env
   ```
   Abre el archivo `.env` y agrega tu API Key de Gemini:
   ```env
   GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"
   PORT=3000
   BUSINESS_MORNING_START="08:30"
   BUSINESS_MORNING_END="12:30"
   BUSINESS_AFTERNOON_START="14:00"
   BUSINESS_AFTERNOON_END="18:00"
   ```

4. **Ejecutar en modo desarrollo:**
   ```bash
   npm run dev
   ```
   O en producción local:
   ```bash
   npm start
   ```

5. **Vincular WhatsApp:**
   * Escanea el código QR que aparecerá en tu terminal, o
   * Abre en tu navegador `http://localhost:3000/qr` para escanearlo cómodamente.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## ⚡ Uso y Características

### 1. Panel Web y Endpoints
* **`GET /` o `/qr`**: Interfaz visual moderna para monitorear el estado y escanear el código QR.
* **`GET /health`**: Endpoint ligero de verificación de estado HTTP 200 para balanceadores y monitores de tiempo de actividad.
* **`GET /status`**: Retorna el estado en formato JSON (`initializing`, `qr_ready`, `ready`, `disconnected`).

### 2. Filtros de Mensajería
* **Anti-Loops:** El bot ignora sus propios mensajes, difusiones y actualizaciones de estado.
* **Exclusión de Grupos:** El bot opera estrictamente en chats privados directos (`@c.us`), ignorando grupos (`@g.us`).
* **Protección de Mensajes Antiguos:** Al encenderse, ignora cualquier mensaje enviado con anterioridad a su hora de inicio.

### 3. Comandos Administrativos
* **`/reactivar`**: Si un chat fue transferido a la contadora (silenciado), enviar este comando reactiva la respuesta automática de la IA y reinicia la memoria del chat.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🌐 Despliegue en Render (24/7)

Para que el bot funcione ininterrumpidamente en la nube:

### Opción A: Despliegue Automático con Blueprint
1. Sube tus cambios a GitHub (`git push origin main`).
2. Entra a [Render Dashboard](https://dashboard.render.com/) y selecciona **Blueprints** > **New Blueprint Instance**.
3. Selecciona este repositorio; Render leerá el archivo [`render.yaml`](file:///c:/Users/osori/Desktop/trabajos%20de%20campus/chatbot-contador/render.yaml).
4. Introduce tu variable `GEMINI_API_KEY` cuando el asistente lo solicite y confirma.

### Opción B: Despliegue Manual como Web Service
1. En Render, presiona **New +** y selecciona **Web Service**.
2. Conecta tu repositorio de GitHub.
3. Configura:
   * **Language / Runtime:** `Docker`
   * **Branch:** `main`
   * **Instance Type:** `Free`
4. En **Environment Variables**, añade:
   * `GEMINI_API_KEY`: Tu clave secreta de Gemini.
   * `PORT`: `3000`
   * `BUSINESS_MORNING_START`: `08:30`
   * `BUSINESS_MORNING_END`: `12:30`
   * `BUSINESS_AFTERNOON_START`: `14:00`
   * `BUSINESS_AFTERNOON_END`: `18:00`
5. Haz clic en **Deploy Web Service**.
6. Una vez desplegado, ingresa a `https://tu-servicio.onrender.com/qr` y escanea el código con tu WhatsApp.

### 🔄 Mantener el Bot Activo 24/7 (Plan Gratuito)
El plan gratuito de Render suspende los servicios web tras 15 minutos de inactividad HTTP. Para evitarlo:
1. Crea una cuenta gratuita en [UptimeRobot](https://uptimerobot.com/) o [Cron-Job.org](https://cron-job.org/).
2. Crea un nuevo monitor tipo **HTTP(s)** con URL: `https://tu-servicio.onrender.com/health`.
3. Configura el intervalo de consulta a **cada 5 a 10 minutos**.
4. ¡Listo! Esto enviará una solicitud continua para mantener el contenedor encendido las 24 horas del día.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🧪 Pruebas

El proyecto cuenta con scripts de validación listos para usar:

* **Probar conexión con Gemini:**
  ```bash
  node test.js
  ```
* **Evaluar latencia de modelos de IA:**
  ```bash
  node test_all.js
  ```
* **Consultar modelos autorizados en tu cuenta de Gemini:**
  ```bash
  node list_models.js
  ```

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 🗺 Hoja de Ruta (Roadmap)

- [x] Arquitectura base con `whatsapp-web.js` y `GoogleGenerativeAI`.
- [x] Limitador de velocidad con Bottleneck para evitar agotar cuota gratuita.
- [x] Manejador de horarios laborales y mensajes automáticos fuera de horario.
- [x] Filtrado de chats grupales y mensajes previos al inicio.
- [x] Servidor HTTP integrado para healthcheck y panel web visual `/qr`.
- [x] Empaquetado Docker con Google Chrome Stable para Render.
- [x] Configuración de despliegue mediante `render.yaml`.
- [ ] Soporte para almacenamiento persistente con Render Disks o RemoteAuth.
- [ ] Transcripción automática de notas de voz entrantes usando Gemini Audio.
- [ ] Panel administrativo con métricas de clientes atendidos.

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

---

## 📬 Contacto

**Santiago Osorio**  
Repositorio del Proyecto: [https://github.com/santiagoosorio0708e-wq/chatbot-contaduria](https://github.com/santiagoosorio0708e-wq/chatbot-contaduria)

<p align="right">(<a href="#top">Volver al inicio ⬆</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[node-badge]: https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white
[node-url]: https://nodejs.org/
[wa-badge]: https://img.shields.io/badge/WhatsApp_Web.js-25D366?style=flat&logo=whatsapp&logoColor=white
[wa-url]: https://wwebjs.dev/
[gemini-badge]: https://img.shields.io/badge/Google_Gemini-8E75C2?style=flat&logo=google&logoColor=white
[gemini-url]: https://ai.google.dev/
[docker-badge]: https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white
[docker-url]: https://www.docker.com/
[bottleneck-badge]: https://img.shields.io/badge/Bottleneck-F59E0B?style=flat
[bottleneck-url]: https://github.com/SGrondin/bottleneck
