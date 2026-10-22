import { describe,it,expect } from 'vitest';
import { hashSecret,verifySecret,token,tokenHash,readCookie,equalHashes,authCookie,appendCookie,validToken,riskHash } from '../../server/lib/security.mjs';
import { isAuthorized,accountManagementAllowed,authorize } from '../../server/lib/authorization.mjs';
import { serverConfig } from '../../server/config.mjs';

describe('security primitives',()=>{
  it('AUTH-TEST rejects invalid KDF input and malformed cookie boundaries', async () => {
    for (const input of [null, '', 'x'.repeat(1025)]) await expect(hashSecret(input)).rejects.toThrow();
    expect(await verifySecret(null, null)).toBe(false);
    expect(await verifySecret('x'.repeat(1025), null)).toBe(false);
    expect(validToken(undefined)).toBe(false);
    expect(validToken(token())).toBe(true);
    expect(readCookie(undefined, 'session')).toBeNull();
    expect(readCookie('x'.repeat(16385), 'session')).toBeNull();
    expect(equalHashes(null, tokenHash('x'))).toBe(false);
    expect(equalHashes(tokenHash('x'), null)).toBe(false);
    expect(equalHashes(tokenHash('x'), 'not-a-hash')).toBe(false);
    expect(() => authCookie('invalid;cookie', token())).toThrow();
    expect(() => authCookie('session', 'unsigned')).toThrow();
    expect(authCookie('session', '', { maxAge: 0, secure: false })).toContain('SameSite=Lax');
    expect(riskHash('person', 'first')).not.toBe(riskHash('person', 'second'));
    for (const existing of [undefined, 'old=value', ['old=value', 'other=value']]) {
      const response = { getHeader: () => existing, setHeader(name, value) { this.header = [name, value]; } };
      appendCookie(response, 'new=value');
      expect(response.header).toEqual(['Set-Cookie', [...(Array.isArray(existing) ? existing : existing ? [existing] : []), 'new=value']]);
    }
  });
  it('hashes passwords with random salts and verifies without trusting encoded work factors',async()=>{
    const [a,b]=await Promise.all([hashSecret('A long unique password!'),hashSecret('A long unique password!')]);
    expect(a).not.toBe(b); expect(a).not.toContain('A long unique password!');
    expect(await verifySecret('A long unique password!',a)).toBe(true);
    expect(await verifySecret('wrong',a)).toBe(false);
    expect(await verifySecret('secret','scrypt$999999999$8$1$bad$bad')).toBe(false);
  });
  it('uses 256-bit opaque tokens and hashed comparison',()=>{
    const a=token(),b=token(); expect(a).toHaveLength(43); expect(a).not.toBe(b);
    expect(equalHashes(tokenHash(a),tokenHash(a))).toBe(true);
    expect(equalHashes(tokenHash(a),tokenHash(b))).toBe(false);
    expect(equalHashes('bad','bad')).toBe(false);
  });
  it('rejects ambiguous, malformed, and unsigned identity cookies',()=>{
    const value=token(); expect(readCookie(`__Host-gdg_session=${value}`,'__Host-gdg_session')).toBe(value);
    expect(readCookie(`__Host-gdg_session=${value}; __Host-gdg_session=${value}`,'__Host-gdg_session')).toBeNull();
    expect(readCookie('admin_data={"role":"super_admin"}','__Host-gdg_session')).toBeNull();
    expect(readCookie('__Host-gdg_session=%7B%22role%22%3A%22super_admin%22%7D','__Host-gdg_session')).toBeNull();
  });
  it('sets the required production cookie boundary',()=>{
    const cookie=authCookie('__Host-gdg_gate',token(),{maxAge:900,strict:true});
    for(const part of ['HttpOnly','Secure','Path=/','SameSite=Strict','Max-Age=900']) expect(cookie).toContain(part);
    expect(cookie).not.toContain('Domain=');
  });
  it('does not allow insecure cookies or non-HTTPS in production',()=>{
    expect(()=>serverConfig({APP_ORIGIN:'http://localhost:8080',NODE_ENV:'production',RISK_HASH_SECRET:'x'.repeat(32)})).toThrow();
    expect(()=>serverConfig({APP_ORIGIN:'https://gdggt.dev',NODE_ENV:'production',ALLOW_INSECURE_LOCAL_COOKIES:'true',RISK_HASH_SECRET:'x'.repeat(32)})).toThrow();
    expect(()=>serverConfig({APP_ORIGIN:'https://gdggt.dev/path',RISK_HASH_SECRET:'x'.repeat(32)})).toThrow();
  });
});
describe('server authorization',()=>{
  const user={id:'one',role:'team_member',is_active:true};
  it('SEC-TEST checks explicit team, owner, page and collaborator boundaries', () => {
    expect(isAuthorized({user,resource:'dashboard'})).toBe(true);
    expect(isAuthorized({user,resource:'teams',memberships:[{is_active:true,team:{is_active:true}}]})).toBe(true);
    for(const membership of [{is_active:false,team:{is_active:true}}, {is_active:true}, {is_active:true,team:{is_active:false}}])
      expect(isAuthorized({user,resource:'teams',memberships:[membership]})).toBe(false);
    expect(isAuthorized({user,resource:'tasks',ownerId:'other'})).toBe(false);
    expect(isAuthorized({user,resource:'forms',action:'edit',collaboratorActions:['edit']})).toBe(true);
    expect(isAuthorized({user,resource:'forms',action:'edit',ownerId:'one',collaboratorActions:['edit']})).toBe(true);
    const membership={team_id:'a',is_active:true,admin_user_id:'one'};
    expect(isAuthorized({user,resource:'forms',action:'edit',teamId:'a',memberships:[membership],collaboratorActions:['edit']})).toBe(true);
    expect(isAuthorized({user,resource:'forms',action:'edit',teamId:'b',memberships:[membership],collaboratorActions:['edit']})).toBe(false);
    const grant={resource:'events',route:'/admin/events',page_access:true,actions:['edit']};
    expect(isAuthorized({user,resource:'events',route:'/admin/events',action:'edit',grants:[grant]})).toBe(true);
    expect(isAuthorized({user,resource:'events',route:'/admin/events',action:'edit',grants:[{...grant,actions:undefined}]})).toBe(false);
    expect(isAuthorized({user,resource:'events',route:'/admin/events',action:'edit',grants:[{...grant,resource:'media'}]})).toBe(false);
    expect(isAuthorized({user:{...user,role:'blog_editor'},resource:'blog_editor'})).toBe(true);
    expect(() => authorize({user,resource:'security'})).toThrow();
    expect(() => authorize({user,resource:'profile'})).not.toThrow();
    expect(accountManagementAllowed(null,user)).toBe(false);
    expect(accountManagementAllowed({...user,is_active:false},user)).toBe(false);
    expect(accountManagementAllowed(user,null)).toBe(false);
    expect(accountManagementAllowed({...user,role:'super_admin'},{id:'other',role:'admin'})).toBe(true);
    expect(accountManagementAllowed({...user,role:'super_admin'},{id:'other',role:'unknown'})).toBe(false);
    expect(accountManagementAllowed({...user,role:'admin'},{id:'other',role:'team_member'})).toBe(true);
    expect(accountManagementAllowed(user,{id:'other',role:'team_member'})).toBe(false);
  });
  it('denies inactive accounts, unknown roles, resources, and actions',()=>{
    for(const candidate of [{...user,is_active:false},{...user,role:'owner'},null]) expect(isAuthorized({user:candidate,resource:'events'})).toBe(false);
    expect(isAuthorized({user:{...user,role:'super_admin'},resource:'made_up'})).toBe(false);
    expect(isAuthorized({user:{...user,role:'super_admin'},resource:'events',action:'made_up'})).toBe(false);
  });
  it('requires both page and action grants and resource team membership',()=>{
    const context={user,resource:'events',action:'edit',route:'/admin/events',teamId:'team-a',memberships:[{team_id:'team-a',admin_user_id:'one',is_active:true}],grants:[{resource:'events',route:'/admin/events',team_id:'team-a',page_access:true,actions:['edit']}]};
    expect(isAuthorized(context)).toBe(true);
    expect(isAuthorized({...context,grants:[{...context.grants[0],actions:['view']}]})).toBe(false);
    expect(isAuthorized({...context,grants:[{...context.grants[0],page_access:false}]})).toBe(false);
    expect(isAuthorized({...context,teamId:'other-team'})).toBe(false);
    expect(isAuthorized({...context,memberships:[{...context.memberships[0],is_active:false}]})).toBe(false);
  });
  it('does not let admin manage security or any role erase audit rows',()=>{
    expect(isAuthorized({user:{...user,role:'admin'},resource:'users',action:'create'})).toBe(false);
    expect(isAuthorized({user:{...user,role:'super_admin'},resource:'audit',action:'delete'})).toBe(false);
    expect(isAuthorized({user:{...user,role:'admin'},resource:'audit',action:'export'})).toBe(true);
  });
  it('enforces editor ownership and publishing restrictions',()=>{
    const editor={...user,role:'blog_editor'};
    expect(isAuthorized({user:editor,resource:'blog_editor',action:'edit',ownerId:'one'})).toBe(true);
    expect(isAuthorized({user:editor,resource:'blog_editor',action:'edit',ownerId:'other'})).toBe(false);
    expect(isAuthorized({user:editor,resource:'blog_editor',action:'publish',ownerId:'one'})).toBe(false);
    expect(isAuthorized({user:editor,resource:'forms',action:'view'})).toBe(false);
  });
  it('prevents self-elevation and admin management of privileged accounts',()=>{
    expect(accountManagementAllowed({...user,role:'super_admin'},user,'admin')).toBe(false);
    expect(accountManagementAllowed({...user,role:'admin'},{id:'other',role:'super_admin'},'team_member')).toBe(false);
    expect(accountManagementAllowed({...user,role:'admin'},{id:'other',role:'team_member'},'admin')).toBe(false);
    expect(accountManagementAllowed({...user,role:'admin'},{id:'other',role:'team_member'},'blog_editor')).toBe(true);
  });
});
