package dev.gdggt.workspace;

import java.net.URI;
import java.util.Set;

/** The only origin allowed to use native account and hardware capabilities. */
final class Policy {
  static final String ORIGIN = "https://gdggt.dev";

  static boolean trusted(String value) {
    try {
      URI u = URI.create(value);
      return "https".equals(u.getScheme())
          && "gdggt.dev".equals(u.getHost())
          && u.getRawUserInfo() == null
          && (u.getPort() == -1 || u.getPort() == 443);
    } catch (Exception e) {
      return false;
    }
  }

  static boolean admin(String value) {
    if (!trusted(value)) return false;
    String path = URI.create(value).getRawPath();
    return path.equals("/admin") || path.startsWith("/admin/");
  }

  static boolean rewards(String value) {
    return trusted(value)
        && Set.of("/admin/rewards", "/admin/rewards/").contains(URI.create(value).getRawPath());
  }

  static String token(String value) {
    if (value == null) return null;
    if (value.matches("[A-Za-z0-9_-]{43}")) return value;
    String prefix = ORIGIN + "/tap#card=";
    return value.startsWith(prefix) && value.substring(prefix.length()).matches("[A-Za-z0-9_-]{43}")
        ? value.substring(prefix.length())
        : null;
  }

  static boolean writable(String value) {
    return token(value) != null && value.equals(ORIGIN + "/tap#card=" + token(value));
  }

  static boolean download(String value) {
    return trusted(value) && URI.create(value).getRawPath().startsWith("/api/v1/admin/");
  }

  static boolean external(String value) {
    try {
      String scheme = URI.create(value).getScheme();
      return Set.of("https", "mailto", "tel").contains(scheme);
    } catch (Exception e) {
      return false;
    }
  }
}
