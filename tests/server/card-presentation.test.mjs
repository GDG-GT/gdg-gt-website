import {describe,it,expect} from 'vitest';
import {parsePresentedCredential,physicalCardPresentation} from '../../shared/card-presentation.mjs';
const credential='a'.repeat(43),uid='04aabbccddeeff';
describe('Physical card presentation boundary',()=>{
 it('keeps a Wallet credential distinct from a chip scan',()=>{expect(parsePresentedCredential(credential)).toEqual({credential});expect(parsePresentedCredential(physicalCardPresentation(credential,'04:AA:BB:CC:DD:EE:FF'))).toEqual({v:2,credential,uid});});
 it.each([{v:1,credential,uid},{v:2,credential,uid:'1234'},{v:2,credential,uid,memberId:'forged'},{v:2,credential:'short',uid}])('rejects malformed or caller-expanded physical proof %#',value=>{expect(parsePresentedCredential(JSON.stringify(value))).toBeNull();});
 it('rejects unrelated URLs, invalid JSON and oversized payloads',()=>{for(const value of ['https://evil.test/tap#card='+credential,'{broken','a'.repeat(301)])expect(parsePresentedCredential(value)).toBeNull();});
});
