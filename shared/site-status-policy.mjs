export function isMaintenanceDestination(value) {
  if (
    value === "" ||
    /^\/l\/[a-z0-9](?:[a-z0-9_-]{0,48}[a-z0-9])?$/.test(value)
  )
    return true;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      ["gatech.edu", "www.gatech.edu", "gdg.community.dev"].includes(
        u.hostname,
      ) &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.search &&
      !u.hash &&
      !/[\u0000-\u0020\u007f]/.test(value) &&
      !/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

export const maintenanceExemptPath = (path) =>
  /^\/admin(?:\/|$)/.test(path) ||
  /^\/l\/[a-z0-9_-]+$/.test(path) ||
  [
    "/maintenance",
    "/offline",
    "/privacy",
    "/accessibility",
    "/newsletter/confirm",
    "/newsletter/unsubscribe",
    "/account/setup",
    "/team/join",
  ].includes(path);
