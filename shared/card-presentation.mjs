import { z } from 'zod';
import { parseCardPayload } from './rewards.mjs';
export const physicalPresentation = z.object({v:z.literal(2),credential:z.string().regex(/^[A-Za-z0-9_-]{43}$/),uid:z.string().regex(/^[a-f0-9]{14}$/)}).strict();
export function parsePresentedCredential(value) {
  if(typeof value!=='string'||value.length>300)return null;
  if(value.startsWith('{')) { try { const result=physicalPresentation.safeParse(JSON.parse(value));return result.success?result.data:null; } catch { return null; } }
  const credential=parseCardPayload(value);return credential?{credential}:null;
}
export const presentedCredential = z.string().max(300).refine(value=>!!parsePresentedCredential(value),'Scan a GDG card or Wallet QR.');
export function physicalCardPresentation(credential,uid){return JSON.stringify(physicalPresentation.parse({v:2,credential,uid:uid.replace(/[:-]/g,'').toLowerCase()}));}
