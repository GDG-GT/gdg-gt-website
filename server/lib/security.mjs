import { randomBytes, createHash, createHmac, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const N = 32768, r = 8, p = 1, keyLength = 64;
const options = { N, r, p, maxmem: 64 * 1024 * 1024 };
const prefix = `scrypt$${N}$${r}$${p}$`;
export const token = () => randomBytes(32).toString('base64url');
export const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
export const riskHash = (value, secret) => createHmac('sha256', secret).update(value).digest('hex');
export const validToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function equalHashes(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left,'hex'), Buffer.from(right,'hex'));
}
export async function hashSecret(secret) {
  if (typeof secret !== 'string' || secret.length<1 || secret.length>1024) throw new Error('Invalid secret length.');
  const salt = randomBytes(16);
  const derived = await scrypt(secret,salt,keyLength,options);
  return prefix + salt.toString('base64url') + '$' + derived.toString('base64url');
}
export async function verifySecret(secret, encoded) {
  const parts = typeof encoded==='string' && encoded.startsWith(prefix) ? encoded.split('$') : [];
  const valid = parts.length===6 && /^[A-Za-z0-9_-]{22}$/.test(parts[4]) && /^[A-Za-z0-9_-]{86}$/.test(parts[5]);
  // Unknown/malformed account hashes take the same bounded KDF path. No dynamic
  // work factors from untrusted hashes and no fast account-enumeration shortcut.
  const salt = valid ? Buffer.from(parts[4],'base64url') : Buffer.alloc(16,7);
  const expected = valid ? Buffer.from(parts[5],'base64url') : Buffer.alloc(keyLength);
  const value = typeof secret==='string' && secret.length<=1024 ? secret : '';
  const actual = await scrypt(value,salt,keyLength,options);
  return timingSafeEqual(actual,expected) && valid && typeof secret==='string';
}
export function readCookie(header, name) {
  if (typeof header!=='string' || header.length>16384) return null;
  const values = header.split(';').map((part)=>part.trim()).filter((part)=>part.startsWith(name+'='));
  if (values.length!==1) return null;
  const value=values[0].slice(name.length+1);
  return validToken(value) ? value : null;
}
export function authCookie(name, value, { maxAge, strict=false, secure=true }={}) {
  if (!/^[A-Za-z0-9_-]+$/.test(name) || (value!=='' && !validToken(value))) throw new Error('Invalid cookie.');
  return `${name}=${value}; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=${strict ? 'Strict' : 'Lax'}; Max-Age=${maxAge}`;
}
export function appendCookie(response, value) {
  const existing=response.getHeader('Set-Cookie');
  response.setHeader('Set-Cookie',[...(Array.isArray(existing) ? existing : existing ? [existing] : []),value]);
}
