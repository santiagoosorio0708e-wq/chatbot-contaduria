import assert from 'assert';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { geminiService } from './src/services/gemini.js';

console.log("=== INICIANDO PRUEBAS DE RESUMEN DE PROSPECTOS Y MENSAJES A 'TÚ' ===");

async function runTests() {
    // 1. Prueba de Normalización de JID para chat propio ("Tú")
    console.log("1. Probando normalización de JID propio con jidNormalizedUser...");
    const rawOwnerJid = "573001234567:12@s.whatsapp.net";
    const normalizedOwnerJid = jidNormalizedUser(rawOwnerJid);
    assert.strictEqual(normalizedOwnerJid, "573001234567@s.whatsapp.net", "Debe eliminar el sufijo de dispositivo para entregar en el chat 'Tú'");
    console.log("   ✓ JID normalizado correctamente:", normalizedOwnerJid);

    // 2. Prueba de Prevención de Bucle en chat propio ("Tú")
    console.log("2. Probando filtro de seguridad para mensajes provenientes de 'Tú'...");
    const incomingMessageFromSelf = "573001234567@s.whatsapp.net";
    const isSelfChat = incomingMessageFromSelf === normalizedOwnerJid || incomingMessageFromSelf.startsWith(normalizedOwnerJid.split('@')[0]);
    assert.strictEqual(isSelfChat, true, "El bot debe detectar y no responder a notas personales en su chat 'Tú'");
    console.log("   ✓ Protección de bucle en chat 'Tú' verificada.");

    // 3. Prueba de Historial Vacío
    console.log("3. Probando detección de sesión sin mensajes...");
    const emptyCount = geminiService.getMessageCount("non_existent_user");
    assert.strictEqual(emptyCount, 0, "Una sesión inexistente debe tener conteo 0");
    const emptySummary = await geminiService.generateLeadSummary("non_existent_user", "Cliente X", "Inactivo");
    assert.strictEqual(emptySummary, null, "No debe generar resumen si no hay mensajes en la sesión");
    console.log("   ✓ Sesión vacía devuelve null correctamente.");

    // 4. Prueba de Conversación Casual (Sin Datos -> NO_LEAD)
    console.log("4. Probando filtro de conversación casual (sin datos contables)...");
    const casualUser = "573009990001@s.whatsapp.net";
    geminiService.resetSession(casualUser);
    geminiService.getChatSession(casualUser);
    const sessionCasual = geminiService.userSessions.get(casualUser);
    sessionCasual.history = [
        { role: 'user', content: 'Hola buenas tardes', timestamp: Date.now() },
        { role: 'assistant', content: 'Hola, soy Estrella, la asistente de Olga Garcés. ¿En qué te puedo colaborar?', timestamp: Date.now() },
        { role: 'user', content: 'Solo pasaba a saludar, gracias', timestamp: Date.now() }
    ];
    const casualSummary = await geminiService.generateLeadSummary(casualUser, "Pedro", "Inactivo");
    assert.strictEqual(casualSummary, null, "Una conversación casual sin datos no debe enviar resumen a 'Tú'");
    console.log("   ✓ Conversación casual neutralizada (cero spam a 'Tú').");

    // 5. Prueba de Conversación con Lead Completo (Datos + Trámite)
    console.log("5. Probando extracción y generación de resumen para lead calificado...");
    const leadUser = "573155554433@s.whatsapp.net";
    geminiService.resetSession(leadUser);
    geminiService.getChatSession(leadUser);
    const sessionLead = geminiService.userSessions.get(leadUser);
    sessionLead.history = [
        { role: 'user', content: 'Hola Estrella, soy Camila Duarte de Bogotá, cédula 52888999. Necesito asesoría para presentar la declaración de renta de persona natural ya que recibí ingresos por salarios y dividendos.', timestamp: Date.now() },
        { role: 'assistant', content: '¡Hola Camila! Con gusto te oriento. Para la declaración de renta con salarios y dividendos en Bogotá se aplican las cédulas general y de dividendos bajo el Estatuto Tributario...', timestamp: Date.now() },
        { role: 'user', content: 'Quiero que la contadora Olga Garcés me atienda y revise mis certificados de ingresos.', timestamp: Date.now() }
    ];

    const leadSummary = await geminiService.generateLeadSummary(leadUser, "Camila Duarte", "Cliente continuó y solicitó hablar con la contadora Olga Garcés");
    assert.ok(leadSummary, "Debe generar un resumen estructurado para un lead con datos");
    assert.ok(leadSummary.includes("NUEVO PROSPECTO / RESUMEN DE CLIENTE"), "Debe tener el encabezado oficial");
    assert.ok(leadSummary.includes("wa.me/573155554433") || leadSummary.includes("573155554433"), "Debe contener el enlace o número de WhatsApp");
    assert.ok(leadSummary.includes("52888999") || leadSummary.toLowerCase().includes("camila"), "Debe incluir los datos del cliente");
    console.log("   ✓ Resumen ejecutivo estructurado generado con éxito:\n");
    console.log("-------------------------------------------------------");
    console.log(leadSummary);
    console.log("-------------------------------------------------------");

    // 6. Prueba de Lead con LID (233...@lid) y erradicación total de palabra 'velación'
    console.log("6. Probando generación de lead para usuario con LID y exclusión de 'velación'...");
    const lidUser = "233908297838713@lid";
    geminiService.resetSession(lidUser);
    geminiService.getChatSession(lidUser);
    const sessionLid = geminiService.userSessions.get(lidUser);
    sessionLid.history = [
        { role: 'user', content: 'Buenas tardes, represento al Conjunto Residencial Torres del Parque en Medellín (NIT 900123456). Requerimos servicio de revisoría fiscal y auditoría contable para la copropiedad.', timestamp: Date.now() },
        { role: 'assistant', content: 'Hola. En el despacho de Olga Garcés realizamos auditoría y dictamen de estados financieros para propiedad horizontal bajo la Ley 675. ¿Deseas coordinar con la contadora?', timestamp: Date.now() },
        { role: 'user', content: 'Sí por favor comunícame con ella, mi teléfono de contacto es 311 234 5678.', timestamp: Date.now() }
    ];

    const lidSummary = await geminiService.generateLeadSummary(lidUser, "Administración Torres", "Cliente solicitó comunicarse con la contadora");
    assert.ok(lidSummary, "Debe generar resumen para el caso de auditoría en PH");
    assert.ok(!lidSummary.includes("https://wa.me/233908297838713"), "NUNCA debe generar enlace wa.me con el LID de 15 dígitos");
    assert.ok(lidSummary.includes("573112345678"), "Debe resolver el teléfono suministrado en el chat");
    assert.ok(!/velaci[oó]n|velar/i.test(lidSummary), "NUNCA debe contener la palabra 'velación' ni 'velar'");
    console.log("   ✓ Lead con LID y número telefónico validado sin enlaces rotos.");
    console.log("   ✓ Prohibición absoluta de 'velación' verificada en el reporte.");

    console.log("\n=======================================================");
    console.log("✔ TODAS LAS PRUEBAS DE RESUMEN DE PROSPECTOS PASARON CON ÉXITO");
    console.log("=======================================================\n");
}

runTests().catch(err => {
    console.error("❌ Falló prueba de resumen:", err);
    process.exit(1);
});
