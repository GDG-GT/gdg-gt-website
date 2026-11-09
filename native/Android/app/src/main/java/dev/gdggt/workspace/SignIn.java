package dev.gdggt.workspace;

import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpCookie;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Credentials go straight to the fixed HTTPS API, never through WebView JavaScript. */
final class SignIn {
  record Response(int status, JSONObject body) {}

  static Response request(String path, JSONObject body) throws Exception {
    if (!path.startsWith("/api/v1/")) throw new Exception("Invalid account request.");
    HttpsURLConnection connection =
        (HttpsURLConnection) new URL(Policy.ORIGIN + path).openConnection();
    connection.setInstanceFollowRedirects(false);
    connection.setConnectTimeout(20000);
    connection.setReadTimeout(20000);
    connection.setRequestProperty("Origin", Policy.ORIGIN);
    connection.setRequestProperty("Accept", "application/json");
    String cookies = CookieManager.getInstance().getCookie(Policy.ORIGIN);
    if (cookies != null) connection.setRequestProperty("Cookie", cookies);
    try {
      if (body != null) {
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        try (var out = connection.getOutputStream()) {
          out.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
      }
      int status = connection.getResponseCode();
      if (status >= 300 && status < 400)
        throw new Exception("The sign-in server returned an unexpected redirect.");
      for (var entry : connection.getHeaderFields().entrySet()) {
        if (entry.getKey() != null && entry.getKey().equalsIgnoreCase("Set-Cookie")) {
          for (String header : entry.getValue())
            for (HttpCookie cookie : HttpCookie.parse(header)) {
              String domain = cookie.getDomain();
              if (cookie.getSecure()
                  && cookie.isHttpOnly()
                  && "/".equals(cookie.getPath())
                  && (domain == null || domain.equals("gdggt.dev") || domain.equals(".gdggt.dev")))
                storeCookie(header);
            }
        }
      }
      InputStream stream =
          status >= 400 ? connection.getErrorStream() : connection.getInputStream();
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      if (stream != null)
        try (stream) {
          byte[] chunk = new byte[4096];
          int count;
          while ((count = stream.read(chunk)) != -1) {
            if (bytes.size() + count > 131072)
              throw new Exception("The account response was too large.");
            bytes.write(chunk, 0, count);
          }
        }
      JSONObject result =
          bytes.size() == 0
              ? new JSONObject()
              : new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
      return new Response(status, result);
    } finally {
      connection.disconnect();
    }
  }

  private static void storeCookie(String header) throws Exception {
    CountDownLatch applied = new CountDownLatch(1);
    AtomicBoolean accepted = new AtomicBoolean();
    new android.os.Handler(android.os.Looper.getMainLooper())
        .post(
            () ->
                CookieManager.getInstance()
                    .setCookie(
                        Policy.ORIGIN,
                        header,
                        success -> {
                          accepted.set(success);
                          applied.countDown();
                        }));
    if (!applied.await(5, TimeUnit.SECONDS) || !accepted.get())
      throw new Exception("Sign-in cookies could not be saved. Try again.");
  }

  static boolean authenticate(JSONObject credentials, boolean restore) throws Exception {
    if (restore) {
      Response checked = request("/api/v1/admin/me", null);
      if (checked.status == 200) {
        JSONObject user = checked.body.optJSONObject("data");
        user = user == null ? null : user.optJSONObject("user");
        if (user != null
            && user.optString("email").equalsIgnoreCase(credentials.getString("email")))
          return false;
      } else if (checked.status != 401)
        throw new Exception("Your account could not be checked. Try again when connected.");
    }
    Response gate =
        request("/api/v1/auth/gate", new JSONObject().put("code", credentials.getString("code")));
    if (gate.status != 200)
      throw new Exception(
          gate.status == 429
              ? "Too many attempts. Wait before trying again."
              : "The access code could not be verified.");
    Response login =
        request(
            "/api/v1/auth/login",
            new JSONObject()
                .put("email", credentials.getString("email"))
                .put("password", credentials.getString("password")));
    if (login.status != 200)
      throw new Exception(
          login.status == 429
              ? "Too many attempts. Wait before trying again."
              : "Sign-in failed. Check your email and password.");
    CookieManager.getInstance().flush();
    return true;
  }
}
