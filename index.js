const { startWhatsAppClient } = require('./src/services/whatsapp');
const { startWebServer } = require('./src/server');

console.log('Iniciando el Chatbot de Contaduría Pública...');

// 1. Iniciar servidor web HTTP (requerido para Render, healthchecks y visualización de QR)
startWebServer();

// 2. Iniciar cliente de WhatsApp Web
startWhatsAppClient();

