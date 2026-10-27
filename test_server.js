const assert = require('assert');
const http = require('http');

// Fijar puerto de prueba para no colisionar
process.env.PORT = '4005';
const { startWebServer } = require('./src/server');

console.log("=== INICIANDO PRUEBAS DEL SERVIDOR HTTP Y RENDER ===");

const server = startWebServer();

function makeRequest(path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 4005,
            path: path,
            method: method,
            headers: {
                'Host': 'localhost:4005'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: data
            }));
        });

        req.on('error', reject);
        req.end();
    });
}

async function runServerTests() {
    try {
        // 1. Probar Healthcheck GET /health
        console.log("1. Probando GET /health (Sonda de Render)...");
        const healthRes = await makeRequest('/health');
        assert.strictEqual(healthRes.statusCode, 200, "Debe responder 200 OK");
        const healthBody = JSON.parse(healthRes.body);
        assert.strictEqual(healthBody.status, 'ok');
        assert.strictEqual(healthBody.service, 'chatbot-contaduria');
        assert.ok(typeof healthBody.uptimeSeconds === 'number');
        console.log("   ✓ Healthcheck respondió 200 con payload válido.");

        // 2. Probar Healthcheck HEAD /health
        console.log("2. Probando HEAD /health...");
        const headRes = await makeRequest('/health', 'HEAD');
        assert.strictEqual(headRes.statusCode, 200);
        assert.strictEqual(headRes.body, '', "El método HEAD no debe retornar cuerpo");
        console.log("   ✓ HEAD /health respondió correctamente.");

        // 3. Probar Encabezados de Seguridad (CSP, nosniff, DENY, etc.)
        console.log("3. Verificando Encabezados de Seguridad HTTP...");
        assert.strictEqual(healthRes.headers['x-content-type-options'], 'nosniff');
        assert.strictEqual(healthRes.headers['x-frame-options'], 'DENY');
        assert.ok(healthRes.headers['content-security-policy'], "Debe incluir política CSP");
        console.log("   ✓ Encabezados de seguridad verificados.");

        // 4. Probar Restricción de Métodos (Rechazo de POST/PUT/DELETE)
        console.log("4. Probando rechazo de métodos no permitidos (POST /health)...");
        const postRes = await makeRequest('/health', 'POST');
        assert.strictEqual(postRes.statusCode, 405, "Debe responder 405 Method Not Allowed");
        console.log("   ✓ Método no permitido bloqueado exitosamente.");

        // 5. Probar Endpoint de Estado /status
        console.log("5. Probando GET /status...");
        const statusRes = await makeRequest('/status');
        assert.strictEqual(statusRes.statusCode, 200);
        const statusBody = JSON.parse(statusRes.body);
        assert.strictEqual(statusBody.status, 'running');
        assert.ok('whatsappStatus' in statusBody);
        console.log("   ✓ GET /status respondió correctamente.");

        // 6. Probar Panel Web /qr
        console.log("6. Probando GET /qr...");
        const qrRes = await makeRequest('/qr');
        assert.strictEqual(qrRes.statusCode, 200);
        assert.ok(qrRes.body.includes('<!DOCTYPE html>'));
        assert.ok(qrRes.body.includes('Despacho de Contaduría Pública'));
        console.log("   ✓ Panel web /qr renderizado correctamente.");

        console.log("\n=======================================================");
        console.log("✔ TODAS LAS PRUEBAS DEL SERVIDOR WEB PASARON CON ÉXITO");
        console.log("=======================================================\n");

    } catch (err) {
        console.error("Error en pruebas del servidor:", err);
        process.exit(1);
    } finally {
        server.close(() => {
            console.log("Servidor de pruebas cerrado.");
            process.exit(0);
        });
    }
}

runServerTests();
