import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const der = (k, type, format) => k.export({ type, format: 'der' }).toString('base64');
const app = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ali = generateKeyPairSync('rsa', { modulusLength: 2048 });
writeFileSync('keys.json', JSON.stringify({
  appPrivPkcs1: der(app.privateKey, 'pkcs1'), appPub: app.publicKey.export({ type: 'spki', format: 'pem' }),
  aliPriv: ali.privateKey.export({ type: 'pkcs8', format: 'pem' }), aliPub: der(ali.publicKey, 'spki'),
}));
