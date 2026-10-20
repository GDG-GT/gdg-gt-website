// Share one real HttpOnly-cookie session in process memory across related
// suites. No login quota reset, persistent bearer file, or fabricated response.
process.env.GDG_LOCAL_TEST_SHARED_SESSION = "true";
const { localHttp } = await import("./lib/local-http.mjs"),
  session = await localHttp();
try {
  await import("./test-local-forms.mjs");
  await import("./test-local-form-access.mjs");
  await import("./test-local-form-branches.mjs");
  await import("./test-local-uploads.mjs");
} finally {
  await session.logout(true);
}
