import fs from 'fs';
import path from 'path';

const targetFile = path.resolve('node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js');

try {
    if (fs.existsSync(targetFile)) {
        let content = fs.readFileSync(targetFile, 'utf8');
        let patched = false;

        // Corregir bug de crash en split cuando se responde a usuarios con direccionamiento @lid
        if (content.includes('authState.creds?.me?.lid.split')) {
            content = content.replace(
                'authState.creds?.me?.lid.split',
                'authState.creds?.me?.lid?.split'
            );
            patched = true;
        }

        if (patched) {
            fs.writeFileSync(targetFile, content, 'utf8');
            console.log('✅ [fix-baileys] Parche aplicado con éxito a messages-send.js (lid.split bug neutralizado).');
        } else {
            console.log('ℹ️ [fix-baileys] messages-send.js ya se encuentra parcheado.');
        }
    } else {
        console.log('⚠️ [fix-baileys] Archivo messages-send.js no encontrado en node_modules.');
    }
} catch (err) {
    console.warn('⚠️ [fix-baileys] No se pudo aplicar el parche:', err.message);
}
