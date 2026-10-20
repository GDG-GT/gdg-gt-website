import {writeFile} from 'node:fs/promises';
import {scannerHealth,scanBuffer} from '../server/lib/scanner.mjs';
const tests=[];const check=(value,name)=>{if(!value)throw new Error('FAIL '+name);tests.push({name,passed:true});console.info('PASS '+name);};
const health=await scannerHealth();check(health.ready,'native scanner responds with a current signature database');
check((await scanBuffer(Buffer.from('Fictional clean local upload fixture.\n'))).clean,'clean text passes the real scanner');
const eicar=String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`;
check(!(await scanBuffer(Buffer.from(eicar))).clean,'harmless EICAR antivirus test signature is rejected');
await writeFile(new URL('../.docs/phase0/local-scanner-integration.json',import.meta.url),JSON.stringify({note:'Real native ClamAV over a loopback-only TCP endpoint. EICAR test string was scanned in memory, not saved to disk.',scanner:health,tests},null,2)+'\n');
