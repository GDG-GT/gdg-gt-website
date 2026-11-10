import { ApiError } from './http.mjs';

export const routes={
  '/admin/rewards':'rewards', '/admin':'dashboard', '/admin/profile':'profile', '/admin/notifications':'profile', '/admin/guide':'guide',
  '/admin/users':'users', '/admin/content':'content', '/admin/events':'events',
  '/admin/team':'team_profiles', '/admin/content/team':'team_profiles', '/admin/members':'members', '/admin/resources':'resources',
  '/admin/newsletter':'newsletter', '/admin/blog':'blog', '/admin/projects':'projects',
  '/admin/sponsors':'sponsors', '/admin/communications':'communications',
  '/admin/channels':'channels', '/admin/whiteboard':'whiteboards', '/admin/gallery':'gallery',
  '/admin/media':'media', '/admin/linktree':'linktree', '/admin/forms':'forms',
  '/admin/site-status':'site_status', '/admin/teams':'teams', '/admin/finances':'finances',
  '/admin/audit-log':'audit', '/admin/privacy':'privacy', '/admin/operations':'operations', '/admin/blog-editor':'blog_editor', '/admin/blog-media':'blog_media',
};
const baseMember=new Set(['dashboard','profile','guide','team_dashboard','channels','communications','finances']);
const editor=new Set(['dashboard','profile','guide','blog_editor','blog_media']);
const resources=new Set([...Object.values(routes),'team_dashboard','security','messages','tasks']);
const actions=new Set(['view','list','read','create','update','edit','delete','publish','approve','moderate',
  'reject','complete','submit','cancel','archive','restore','export','view_responses','view_sensitive_responses',
  'export_responses','manage_access','send_email','invite','manage_users','rotate_gate','revoke_session',
  'manage_permissions','pin','check_in','download','upload','redact']);

/** One server-owned decision point. A missing grant is always a denial. */
export function isAuthorized({user,resource,action='view',route,teamId,ownerId,grants=[],memberships=[],collaboratorActions=[]}) {
  if (!user?.is_active || !['super_admin','admin','team_member','blog_editor'].includes(user.role)) return false;
  if (!resources.has(resource) || !actions.has(action)) return false;
  if (resource==='audit' && !['view','list','read','export'].includes(action)) return false;
  if (user.role==='super_admin') return true;
  if (resource==='users' || resource==='security' || resource==='privacy' || resource==='operations' || resource==='rewards') return false;
  if (user.role==='admin') return true;
  if (resource==='teams' && ['view','list','read'].includes(action) && memberships.some(m=>m.is_active && m.team?.is_active)) return true;
  if (user.role==='blog_editor') {
    if (!editor.has(resource)) return false;
    if (['publish','approve','moderate','manage_users'].includes(action)) return false;
    return !ownerId || ownerId===user.id;
  }
  if (ownerId && ['profile','messages','tasks'].includes(resource) && ownerId!==user.id) return false;
  const membership=teamId ? memberships.find((item)=>item.team_id===teamId && item.is_active && item.admin_user_id===user.id) : null;
  if (teamId && !membership) return false;
  if (baseMember.has(resource) && ['view','list','read'].includes(action)) return true;
  const relevant=grants.filter((grant)=>grant.resource===resource && (!teamId || grant.team_id===teamId));
  const pageAllowed=relevant.some((grant)=>grant.route===route && grant.page_access===true);
  const actionAllowed=relevant.some((grant)=>grant.actions?.includes(action));
  if (resource==='forms' && collaboratorActions.includes(action) && (ownerId===user.id || !teamId || membership)) return true;
  return pageAllowed && actionAllowed;
}
export function authorize(context) {
  if (!isAuthorized(context)) throw new ApiError(403,'FORBIDDEN','You do not have access to this action.');
}
export function accountManagementAllowed(actor,target,nextRole) {
  if (!actor?.is_active || !target || actor.id===target.id) return false;
  if (actor.role==='super_admin') return ['super_admin','admin','team_member','blog_editor'].includes(nextRole || target.role);
  return actor.role==='admin' && ['team_member','blog_editor'].includes(target.role)
    && ['team_member','blog_editor'].includes(nextRole || target.role);
}
