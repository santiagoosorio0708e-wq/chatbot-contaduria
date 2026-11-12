import assert from 'assert';
import { 
    safeJsonParse, 
    safeJsonStringify, 
    sanitizeInput, 
    escapeHtml, 
    serializeForScript, 
    redactSensitiveData,
    createRateLimiter,
    isPureEmoji,
    isUnintelligibleOrSingleChar,
    resolveWhatsAppContact
} from './src/utils/security.js';

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

// 9. Prueba de Detección de Mensajes de Solo Emoticonos / Emojis
console.log("9. Probando filtro de mensajes con solo emoticonos (isPureEmoji)...");
assert.strictEqual(isPureEmoji("👍"), true, "Emoji simple debe detectarse como puro");
assert.strictEqual(isPureEmoji("👋😊"), true, "Múltiples emojis deben detectarse como puro");
assert.strictEqual(isPureEmoji("👍🏼"), true, "Emoji con modificador de piel debe detectarse como puro");
assert.strictEqual(isPureEmoji("   😂😂😂   "), true, "Emojis con espacios deben ser puro");
assert.strictEqual(isPureEmoji("Hola 👍"), false, "Texto con emoji no debe considerarse puro emoji");
assert.strictEqual(isPureEmoji("renta"), false, "Texto puro no es emoji");
console.log("   ✓ Detección y filtrado de solo emoticonos verificada.");

// 10. Prueba de Detección de Letra Única o Palabras Ininteligibles
console.log("10. Probando filtro de letra única y palabras ininteligibles (isUnintelligibleOrSingleChar)...");
assert.strictEqual(isUnintelligibleOrSingleChar("a"), true, "Una sola letra debe ser ininteligible");
assert.strictEqual(isUnintelligibleOrSingleChar("x"), true, "Una sola letra 'x' debe ser ininteligible");
assert.strictEqual(isUnintelligibleOrSingleChar("?"), true, "Un solo signo debe ser ininteligible");
assert.strictEqual(isUnintelligibleOrSingleChar("..."), true, "Puntos suspensivos solos deben ser ininteligibles");
assert.strictEqual(isUnintelligibleOrSingleChar("????"), true, "Signos solos deben ser ininteligibles");
assert.strictEqual(isUnintelligibleOrSingleChar("aaaaaa"), true, "Caracteres idénticos repetidos deben ser ininteligibles");
assert.strictEqual(isUnintelligibleOrSingleChar("zzzz"), true, "Repetidos 'zzzz' deben ser ininteligibles");
assert.strictEqual(isUnintelligibleOrSingleChar("asdfgh"), true, "Teclazo 'asdfgh' debe ser ininteligible");
assert.strictEqual(isUnintelligibleOrSingleChar("qwerty"), true, "Teclazo 'qwerty' debe ser ininteligible");
assert.strictEqual(isUnintelligibleOrSingleChar("sdfgh"), true, "Consonantes sin vocales deben ser ininteligibles");
assert.strictEqual(isUnintelligibleOrSingleChar("jk"), true, "2 consonantes sin vocales deben ser ininteligibles");
assert.strictEqual(isUnintelligibleOrSingleChar("42"), true, "Número muy corto sin contexto debe ser ininteligible");
assert.strictEqual(isUnintelligibleOrSingleChar("ok"), false, "'ok' es palabra válida");
assert.strictEqual(isUnintelligibleOrSingleChar("si"), false, "'si' es palabra válida");
assert.strictEqual(isUnintelligibleOrSingleChar("no"), false, "'no' es palabra válida");
assert.strictEqual(isUnintelligibleOrSingleChar("hola"), false, "'hola' es palabra válida");
assert.strictEqual(isUnintelligibleOrSingleChar("renta"), false, "'renta' es palabra válida");
assert.strictEqual(isUnintelligibleOrSingleChar("10203040"), false, "Cédula o número largo es válido");
assert.strictEqual(isUnintelligibleOrSingleChar("necesito asesoría tributaria"), false, "Frase válida");
console.log("   ✓ Detección de mensajes ininteligibles y letra única verificada.");

// 11. Prueba de Resolución de Contacto de WhatsApp (Evitar wa.me/ con LIDs rotos)
console.log("11. Probando resolución segura de contactos de WhatsApp (resolveWhatsAppContact)...");
// Caso A: JID telefónico directo
const directContact = resolveWhatsAppContact("573109876543@s.whatsapp.net", "María");
assert.strictEqual(directContact.isDirectLink, true);
assert.strictEqual(directContact.phone, "573109876543");
assert.ok(directContact.display.includes("https://wa.me/573109876543"));

// Caso B: LID con teléfono en el chat
const chatPhoneContact = resolveWhatsAppContact("233908297838713@lid", "Carlos", [
    { role: "user", content: "Hola mi celular es 312 456 7890 para que me llamen" }
]);
assert.strictEqual(chatPhoneContact.isDirectLink, true);
assert.strictEqual(chatPhoneContact.phone, "573124567890");
assert.ok(chatPhoneContact.display.includes("https://wa.me/573124567890"));

// Caso C: LID con teléfono en mapa dinámico
const lidMap = new Map([["233908297838713@lid", "573001234567"]]);
const mappedContact = resolveWhatsAppContact("233908297838713@lid", "Pedro", [], lidMap);
assert.strictEqual(mappedContact.isDirectLink, true);
assert.strictEqual(mappedContact.phone, "573001234567");
assert.ok(mappedContact.display.includes("https://wa.me/573001234567"));

// Caso D: LID anónimo sin teléfono conocido (modo privado)
const anonymousLid = resolveWhatsAppContact("233908297838713@lid", "Cliente Anónimo", []);
assert.strictEqual(anonymousLid.isDirectLink, false);
assert.strictEqual(anonymousLid.phone, null);
assert.ok(!anonymousLid.display.includes("https://wa.me/233908297838713"), "NUNCA debe generar un enlace roto con LID de 15 dígitos");
assert.ok(anonymousLid.display.includes("Número oculto por privacidad"));
assert.ok(anonymousLid.note.includes("Cliente Anónimo"));
console.log("   ✓ Resolución segura y verídica de números WhatsApp verificada.");

console.log("\n=======================================================");
console.log("✔ TODAS LAS PRUEBAS DE SEGURIDAD PASARON SATISFACTORIAMENTE");
console.log("=======================================================\n");
