import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

export function command(program, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ['pipe','pipe','pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function disposablePostgres(purpose) {
  if (!/^[a-z-]+$/.test(purpose)) throw new Error('Invalid database test purpose.');
  const name = `gdg-${purpose}-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const start = await command('docker', ['run','-d','--name',name,'--label',`dev.gdggt.purpose=${purpose}`,
    '--network','none','--memory','768m','--cpus','1','-e',`POSTGRES_PASSWORD=${randomBytes(32).toString('base64url')}`,'postgres:17']);
  if (start.code !== 0) throw new Error('Disposable database could not start; no existing database was touched.');
  const stop = async () => {
    const check = await command('docker', ['inspect',name,'--format','{{index .Config.Labels "dev.gdggt.purpose"}}']);
    if (check.code !== 0 || check.stdout.trim() !== purpose) throw new Error('Refusing to stop an unverified container.');
    await command('docker',['stop',name]);
  };
  try {
    for (let attempt=0;attempt<60;attempt++) {
      if ((await command('docker',['exec',name,'pg_isready','-U','postgres'])).code === 0) {
        return { name, stop,
          sql: (source, { database='postgres', terse=true }={}) => command('docker', ['exec','-i',name,'psql','-X','-U','postgres','-d',database,
            '--set=ON_ERROR_STOP=1',`--set=VERBOSITY=${terse ? 'terse' : 'default'}`,'-qAt'],source),
        };
      }
      await new Promise((resolve) => setTimeout(resolve,500));
    }
    throw new Error('Disposable database readiness timeout.');
  } catch (error) { await stop(); throw error; }
}
