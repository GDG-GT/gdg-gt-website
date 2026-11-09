package dev.gdggt.workspace;

import static org.junit.Assert.*;

import org.junit.Test;

public class PolicyTest {
  @Test
  public void trustIsOriginBound() {
    assertTrue(Policy.admin("https://gdggt.dev/admin/forms/123"));
    for (String url :
        new String[] {
          "http://gdggt.dev/admin",
          "https://gdggt.dev.evil.test/admin",
          "https://user@gdggt.dev/admin",
          "https://gdggt.dev:444/admin",
          "https://gdggt.dev/administrator",
          "https://gdggt.dev/%61dmin",
          "data:text/html,x"
        }) assertFalse(url, Policy.admin(url));
  }

  @Test
  public void onlyChapterCredentialsAreAccepted() {
    String token = "A".repeat(43), url = Policy.ORIGIN + "/tap#card=" + token;
    assertEquals(token, Policy.token(token));
    assertEquals(token, Policy.token(url));
    assertTrue(Policy.writable(url));
    assertFalse(Policy.writable(token));
    assertNull(Policy.token("https://evil.test/tap#card=" + token));
    assertNull(Policy.token(url + "&extra=1"));
    assertNull(Policy.token(Policy.ORIGIN + "/tap?x=1#card=" + token));
  }

  @Test
  public void hardwareAndDownloadsStayScoped() {
    assertTrue(Policy.rewards(Policy.ORIGIN + "/admin/rewards"));
    assertFalse(Policy.rewards(Policy.ORIGIN + "/admin/forms"));
    assertTrue(Policy.download(Policy.ORIGIN + "/api/v1/admin/exports/123"));
    assertFalse(Policy.download("https://evil.test/api/v1/admin/export"));
    assertFalse(Policy.external("javascript:alert(1)"));
    assertFalse(Policy.external("intent://evil"));
  }
}
