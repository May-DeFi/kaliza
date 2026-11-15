import crypto from 'node:crypto';
import { env } from '../../config/env.js';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
function getKey() {
    const keyHex = env.encryption.key;
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
        const hashed = crypto.createHash('sha256').update(keyHex).digest();
        return hashed;
    }
    return key;
}
export function encrypt(plaintext) {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
}
export function decrypt(ciphertext) {
    const key = getKey();
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}
export function hashString(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}
export function generateCorrelationId() {
    return crypto.randomUUID();
}
export function generateIdempotencyKey() {
    return crypto.randomUUID();
}
//# sourceMappingURL=crypto.js.map