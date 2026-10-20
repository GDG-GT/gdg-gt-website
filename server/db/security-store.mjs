import { unavailable, ApiError } from "../lib/http.mjs";

const checked = ({ data, error }) => {
  if (error) throw unavailable();
  return data;
};
export class SecurityStore {
  constructor(database) {
    this.db = database;
  }
  async gateConfiguration(initialHash) {
    let row = checked(
      await this.db
        .from("security_configuration")
        .select("gate_hash,gate_version")
        .eq("id", true)
        .maybeSingle(),
    );
    if (
      !row &&
      typeof initialHash === "string" &&
      initialHash.startsWith("scrypt$")
    ) {
      checked(
        await this.db
          .from("security_configuration")
          .upsert(
            { id: true, gate_hash: initialHash },
            { onConflict: "id", ignoreDuplicates: true },
          ),
      );
      row = checked(
        await this.db
          .from("security_configuration")
          .select("gate_hash,gate_version")
          .eq("id", true)
          .single(),
      );
    }
    if (!row) throw unavailable();
    return row;
  }
  async rateLimit(scope, riskHash, limit, seconds) {
    return checked(
      await this.db.rpc("take_rate_limit", {
        p_scope: scope,
        p_risk_hash: riskHash,
        p_limit: limit,
        p_window_seconds: seconds,
      }),
    );
  }
  async checkRateLimit(scope, riskHash, limit) {
    return checked(
      await this.db.rpc("check_rate_limit", {
        p_scope: scope,
        p_risk_hash: riskHash,
        p_limit: limit,
      }),
    );
  }
  async createGate(hash, version) {
    checked(
      await this.db
        .from("gate_sessions")
        .insert({ token_hash: hash, gate_version: version }),
    );
  }
  async validGate(hash, version) {
    const row = checked(
      await this.db
        .from("gate_sessions")
        .select("id")
        .eq("token_hash", hash)
        .eq("gate_version", version)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    );
    return !!row?.id;
  }
  async accountByEmail(email) {
    return checked(
      await this.db
        .from("admin_users")
        .select(
          "id,email,password_hash,role,is_active,display_name,locked_until,created_at,must_change_password,temporary_password_expires_at,deleted_at",
        )
        .eq("email", email)
        .maybeSingle(),
    );
  }
  async createSession({
    adminId,
    tokenHash,
    csrfHash,
    gateHash,
    passwordHash,
    requestId,
  }) {
    const { data, error } = await this.db.rpc("create_server_session", {
      p_admin_id: adminId,
      p_token_hash: tokenHash,
      p_csrf_hash: csrfHash,
      p_gate_hash: gateHash,
      p_verified_password_hash: passwordHash,
      p_request_id: requestId,
    });
    if (error) {
      if (error.code === "28000")
        throw new ApiError(
          401,
          "AUTH_REQUIRED",
          "We couldn’t sign you in. Please try again.",
        );
      throw unavailable();
    }
    return data;
  }
  async recordLoginFailure(account) {
    if (account)
      checked(
        await this.db.rpc("record_login_failure", {
          p_admin_id: account.id,
          p_verified_hash: account.password_hash,
        }),
      );
  }
  async changePassword({
    adminId,
    sessionId,
    verifiedHash,
    newHash,
    tokenHash,
    csrfHash,
    requestId,
  }) {
    const { error } = await this.db.rpc("change_password_atomic", {
      p_admin_id: adminId,
      p_session_id: sessionId,
      p_verified_hash: verifiedHash,
      p_new_hash: newHash,
      p_token_hash: tokenHash,
      p_csrf_hash: csrfHash,
      p_request_id: requestId,
    });
    if (error?.code === "28000")
      throw new ApiError(
        401,
        "AUTH_REQUIRED",
        "Your session has ended. Please sign in again.",
      );
    if (error) throw unavailable();
  }
  async rotateGate(actorId, hash, requestId) {
    return checked(
      await this.db.rpc("rotate_gate_atomic", {
        p_actor_id: actorId,
        p_hash: hash,
        p_request_id: requestId,
      }),
    );
  }
  async validateSession(hash) {
    return checked(
      await this.db.rpc("validate_server_session", { p_token_hash: hash }),
    );
  }
  async csrf(sessionId) {
    return checked(
      await this.db
        .from("csrf_tokens")
        .select("token_hash,expires_at")
        .eq("session_id", sessionId)
        .maybeSingle(),
    );
  }
  async rotateCsrf(sessionId, hash) {
    checked(
      await this.db
        .from("csrf_tokens")
        .update({
          token_hash: hash,
          expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
          rotated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId),
    );
  }
  async memberships(userId) {
    return checked(
      await this.db
        .from("team_memberships")
        .select(
          "id,team_id,admin_user_id,role,is_active,joined_at,created_at,updated_at,team:admin_teams(id,name,description,slug,color,icon,is_active,created_at,updated_at)",
        )
        .eq("admin_user_id", userId)
        .eq("is_active", true),
    );
  }
  async authorization(userId) {
    const memberships = await this.memberships(userId),
      ids = memberships.filter((m) => m.team?.is_active).map((m) => m.team_id);
    if (!ids.length) return { memberships, grants: [] };
    const permissions = checked(
      await this.db
        .from("team_permissions")
        .select(
          "team_id,resource_type,permission,can_create,can_read,can_update,can_delete",
        )
        .in("team_id", ids),
    );
    const pages = checked(
      await this.db
        .from("team_page_access")
        .select("team_id,page_path,can_access")
        .in("team_id", ids),
    );
    const aliases = {
      team_members: "team_profiles",
      site_content: "content",
      admin_teams: "teams",
      admin_users: "users",
    };
    const grants = [];
    for (const permission of permissions)
      for (const page of pages.filter(
        (p) => p.team_id === permission.team_id && p.can_access,
      )) {
        const actions = ["create", "read", "update", "delete"].filter(
          (action) => permission["can_" + action],
        );
        if (permission.can_read) actions.push("view", "list");
        if (
          permission.can_update &&
          ["publish", "events.publish"].includes(permission.permission)
        )
          actions.push("publish");
        grants.push({
          team_id: permission.team_id,
          resource:
            aliases[permission.resource_type] || permission.resource_type,
          route: page.page_path,
          page_access: true,
          actions,
        });
      }
    return { memberships, grants };
  }
  async revokeSession(id) {
    checked(
      await this.db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .is("revoked_at", null),
    );
    checked(await this.db.from("csrf_tokens").delete().eq("session_id", id));
  }
  async revokeOtherSessions(userId, currentSessionId) {
    checked(
      await this.db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("admin_user_id", userId)
        .neq("id", currentSessionId)
        .is("revoked_at", null),
    );
  }
  async audit({
    actorId = null,
    action,
    targetType = null,
    targetId = null,
    requestId,
    result = "success",
    metadata = {},
  }) {
    checked(
      await this.db.from("admin_actions").insert({
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        request_id: requestId,
        result,
        metadata,
      }),
    );
  }
}
