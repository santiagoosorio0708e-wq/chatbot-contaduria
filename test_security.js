const assert = require('assert');
const { 
    safeJsonParse, 
    safeJsonStringify, 
    sanitizeInput, 
    escapeHtml, 
    serializeForScript, 
    redactSensitiveData,
    createRateLimiter 
} = require('./src/utils/security');

console.log("=== INICIANDO PRUEBAS DE SEGURIDAD Y OPTIMIZACIÓN ===");

// 1. Prueba de Protección contra Prototype Pollution en JSON
console.log("1. Probando safeJsonParse (Prototype Pollution)...");
const maliciousPayload = '{"__proto__": {"isAdmin": true}, "constructor": {"prototype": {"hacked": true}}, "normalKey": "val"}';
const parsed = safeJsonParse(maliciousPayload, {});
assert.strictEqual(parsed.normalKey, "val", "Debe mantener claves normales");
assert.strictEqual({}.isAdmin, undefined, "Object.prototype no debe estar contaminado por __proto__");
assert.strictEqual({}.hacked, undefined, "Object.prototype no debe estar contaminado por constructor.prototype");
console.log("   ✓ Prototype Pollution neutralizado exitosamente.");

// 2. Prueba de tolerancia a JSON malformado
console.log("2. Probando tolerancia a JSON inválido...");
const badJson = '{"incompleto": ';
const fallbackResult = safeJsonParse(badJson, { status: "fallback" });
assert.strictEqual(fallbackResult.status, "fallback", "Debe devolver el valor de respaldo sin lanzar excepciones");
console.log("   ✓ Tolerancia a fallos en JSON verificada.");

// 3. Prueba de Serialización Segura y Detección de Ciclos
console.log("3. Probando safeJsonStringify y referencias circulares...");
const circularObj = { name: "test" };
circularObj.self = circularObj;
const stringified = safeJsonStringify(circularObj);
assert.ok(stringified.includes("[Circular]"), "Debe manejar referencias circulares sin crash");
console.log("   ✓ Prevención de DoS por referencias circulares verificada.");

// 4. Prueba de Ofuscación de Credenciales y API Keys
console.log("4. Probando ofuscación de secretos en logs y JSON...");
const dummyApiKey = ['A', 'I', 'z', 'a', 'Sy', 'DummyKeyForUnitTestPurposesOnly1234567890'].join('');
const sensitiveObj = {
    apiKey: dummyApiKey,
    password: "secret_password_123",
    description: "Conectando al servicio con key=" + dummyApiKey
};
const maskedJson = safeJsonStringify(sensitiveObj);
assert.ok(!maskedJson.includes("DummyKeyForUnitTest"), "La clave sensible no debe estar visible");
assert.ok(!maskedJson.includes("secret_password_123"), "La contraseña no debe estar visible");
assert.ok(maskedJson.includes("[REDACTED"), "Debe incluir indicador [REDACTED]");
console.log("   ✓ Censura estricta de credenciales verificada.");

// 5. Prueba de Sanitización de Entradas (Null bytes y DoS por longitud)
console.log("5. Probando sanitización de entradas de texto...");
const dirtyInput = "Hola mundo\x00\x08 con caracteres nulos" + "a".repeat(2000);
const cleanInput = sanitizeInput(dirtyInput, 100);
assert.ok(!cleanInput.includes("\x00"), "Debe eliminar bytes nulos");
assert.ok(cleanInput.length <= 100, "Debe limitar la longitud máxima");
assert.ok(cleanInput.startsWith("Hola mundo con"), "Debe mantener texto legítimo");
console.log("   ✓ Sanitización contra inyecciones y desbordamiento verificada.");

// 6. Prueba de Prevención XSS en HTML
console.log("6. Probando escape de HTML (Anti-XSS)...");
const xssPayload = '<script>alert("xss")</script>&"\'';
const escaped = escapeHtml(xssPayload);
assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&quot;&#39;');
console.log("   ✓ Escape de entidades HTML verificado.");

// 7. Prueba de Serialización Segura para scripts
console.log("7. Probando serializeForScript...");
const dangerousScriptData = "</script><script>alert(1)</script>";
const safeScriptOutput = serializeForScript(dangerousScriptData);
assert.ok(!safeScriptOutput.includes("</script>"), "No debe contener tags de cierre sin escapar");
assert.ok(safeScriptOutput.includes("\\u003c/script\\u003e"), "Debe usar escapes Unicode seguros");
console.log("   ✓ Inyección en scripts neutralizada.");

// 8. Prueba del Rate Limiter en memoria
console.log("8. Probando Rate Limiter deslizante...");
const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 3 });
assert.strictEqual(limiter("192.168.1.1"), true, "Req 1 permitida");
assert.strictEqual(limiter("192.168.1.1"), true, "Req 2 permitida");
assert.strictEqual(limiter("192.168.1.1"), true, "Req 3 permitida");
assert.strictEqual(limiter("192.168.1.1"), false, "Req 4 bloqueada por exceder límite");
assert.strictEqual(limiter("192.168.1.2"), true, "Otra IP diferente debe permitirse");
console.log("   ✓ Rate limiter funciona correctamente por IP.");

console.log("\n=======================================================");
console.log("✔ TODAS LAS PRUEBAS DE SEGURIDAD PASARON SATISFACTORIAMENTE");
console.log("=======================================================\n");
