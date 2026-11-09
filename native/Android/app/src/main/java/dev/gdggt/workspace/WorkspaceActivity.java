package dev.gdggt.workspace;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.nfc.*;
import android.nfc.tech.Ndef;
import android.os.Bundle;
import android.text.InputType;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.button.MaterialButton;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.Cipher;
import javax.net.ssl.HttpsURLConnection;
import org.json.*;

/** Native navigation, device-bound sign-in and card hardware around shared chapter workflows. */
public class WorkspaceActivity extends AppCompatActivity {
  private final ExecutorService work = Executors.newSingleThreadExecutor();
  private AccountVault vault;
  private WebView web;
  private FrameLayout content;
  private LinearLayout root;
  private Toolbar toolbar;
  private BottomNavigationView tabs;
  private TextView status;
  private ProgressBar progress;
  private boolean unlocked,
      busy,
      hasWorkspace,
      pickerOpen,
      backgrounded,
      navigationReady,
      compatible = true;
  private volatile int generation;
  private volatile String pendingId;
  private String path = "/admin", pendingDocument;
  private int pendingGeneration;
  private final LinkedHashMap<String, String> destinations = new LinkedHashMap<>();
  private NfcAdapter nfc;
  private android.os.Handler handler;
  private PermissionRequest cameraRequest;
  private ValueCallback<Uri[]> fileCallback;
  private AlertDialog scanDialog;
  private BlobExport blobExport;
  private final ActivityResultLauncher<String> cameraPermission =
      registerForActivityResult(
          new ActivityResultContracts.RequestPermission(),
          allowed -> {
            pickerOpen = false;
            if (cameraRequest != null) {
              if (allowed
                  && unlocked
                  && Policy.admin(web.getUrl())
                  && Policy.trusted(cameraRequest.getOrigin().toString()))
                cameraRequest.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
              else cameraRequest.deny();
              cameraRequest = null;
            }
          });
  private final ActivityResultLauncher<Intent> filePicker =
      registerForActivityResult(
          new ActivityResultContracts.StartActivityForResult(),
          result -> {
            pickerOpen = false;
            if (fileCallback != null) {
              fileCallback.onReceiveValue(
                  unlocked
                      ? WebChromeClient.FileChooserParams.parseResult(
                          result.getResultCode(), result.getData())
                      : null);
              fileCallback = null;
            }
          });
  private static final String SHIM =
      """
(() => {
  if (window.top !== window || location.origin !== 'https://gdggt.dev') return;
  Object.defineProperty(window,'gdgScanner',{value:Object.freeze({version:1,admin:true,wallet:false,platform:'android'}),configurable:false});
  const post = kind => ({postMessage: value => GDGNative.postMessage(JSON.stringify({kind,body:value}))});
  Object.defineProperty(window,'webkit',{value:Object.freeze({messageHandlers:Object.freeze({gdgScanner:post('scanner'),gdgAdmin:post('admin')})}),configurable:false});
})();
""";

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    if (!BuildConfig.DEBUG) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    vault = new AccountVault(this);
    handler = new android.os.Handler(getMainLooper());
    nfc = NfcAdapter.getDefaultAdapter(this);
    root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.rgb(247, 247, 245));
    ViewCompat.setOnApplyWindowInsetsListener(
        root,
        (view, insets) -> {
          var bars =
              insets.getInsets(
                  WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
          view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
          return insets;
        });
    toolbar = new Toolbar(this);
    toolbar.setTitleTextColor(Color.rgb(44, 43, 41));
    root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(56)));
    progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
    progress.setMax(100);
    progress.setVisibility(View.GONE);
    root.addView(progress, new LinearLayout.LayoutParams(-1, dp(2)));
    content = new FrameLayout(this);
    root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
    tabs = new BottomNavigationView(this);
    tabs.setLabelVisibilityMode(BottomNavigationView.LABEL_VISIBILITY_LABELED);
    tabs.setBackgroundColor(Color.rgb(247, 247, 245));
    String[] titles = {"Home", "Events", "Check-in", "Members", "More"};
    int[] icons = {
      R.drawable.ic_home,
      R.drawable.ic_calendar,
      R.drawable.ic_nfc,
      R.drawable.ic_members,
      R.drawable.ic_tools
    };
    for (int i = 0; i < titles.length; i++)
      tabs.getMenu().add(0, i + 1, i, titles[i]).setIcon(icons[i]);
    tabs.setOnItemSelectedListener(
        item -> {
          if (!unlocked) return false;
          int id = item.getItemId();
          if (id == 5) showTools();
          else
            navigate(
                new String[] {"/admin", "/admin/events", "/admin/rewards", "/admin/members"}
                    [id - 1]);
          return true;
        });
    root.addView(tabs, new LinearLayout.LayoutParams(-1, -2));
    setContentView(root);
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                if (unlocked && web.canGoBack()) navigate("back");
                else moveTaskToBack(true);
              }
            });
    blobExport = new BlobExport(new File(getCacheDir(), "exports"));
    createWeb();
    clearExports();
    showSignIn("");
    if (vault.exists()) content.post(this::unlock);
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private TextView label(String value, int size) {
    TextView v = new TextView(this);
    v.setText(value);
    v.setTextColor(Color.rgb(44, 43, 41));
    v.setTextSize(size);
    v.setPadding(0, dp(8), 0, dp(8));
    return v;
  }

  private EditText field(LinearLayout parent, String title, int type) {
    TextView fieldLabel = label(title, 14);
    parent.addView(fieldLabel);
    EditText v = new EditText(this);
    v.setId(View.generateViewId());
    fieldLabel.setLabelFor(v.getId());
    v.setSingleLine();
    v.setInputType(type);
    v.setTextSize(16);
    v.setMinHeight(dp(48));
    v.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
    parent.addView(v, new LinearLayout.LayoutParams(-1, -2));
    return v;
  }

  private Button button(LinearLayout parent, String title, Runnable action) {
    MaterialButton b = new MaterialButton(this);
    b.setCornerRadius(dp(10));
    b.setText(title);
    b.setAllCaps(false);
    b.setMinHeight(dp(48));
    b.setOnClickListener(v -> action.run());
    parent.addView(b, new LinearLayout.LayoutParams(-1, -2));
    return b;
  }

  private void showSignIn(String message) {
    unlocked = false;
    toolbar.setTitle("GDG Workspace");
    toolbar.setNavigationIcon(null);
    toolbar.getMenu().clear();
    tabs.setVisibility(View.GONE);
    progress.setVisibility(View.GONE);
    content.removeAllViews();
    ScrollView scroll = new ScrollView(this);
    LinearLayout form = new LinearLayout(this);
    form.setOrientation(LinearLayout.VERTICAL);
    form.setPadding(dp(24), dp(24), dp(24), dp(24));
    scroll.setFillViewport(true);
    scroll.addView(form);
    content.addView(scroll);
    form.addView(label("GDG@GT", 20));
    form.addView(label(vault.exists() ? "Welcome back" : "Chapter workspace", 30));
    status = label(message, 16);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    form.addView(status);
    if (vault.exists()) button(form, "Unlock with biometrics", this::unlock);
    EditText code =
        field(
            form,
            "Access code",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    EditText email =
        field(
            form, "Email", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    EditText password =
        field(form, "Password", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    CheckBox remember = new CheckBox(this);
    remember.setText("Remember with biometrics");
    remember.setChecked(true);
    remember.setPadding(0, dp(12), 0, dp(12));
    form.addView(remember);
    Button signIn =
        button(
            form,
            "Sign in",
            () -> {
              if (busy) return;
              try {
                JSONObject credentials =
                    new JSONObject()
                        .put("code", code.getText().toString())
                        .put("email", email.getText().toString().trim())
                        .put("password", password.getText().toString());
                if (credentials.getString("code").isBlank()
                    || credentials.getString("email").isBlank()
                    || credentials.getString("password").isEmpty()) {
                  status.setText("Enter your access code, email and password.");
                  return;
                }
                password.getText().clear();
                code.getText().clear();
                authenticate(credentials, false, remember.isChecked());
              } catch (JSONException ignored) {
                status.setText("Your account could not be read. Try again.");
              }
            });
    password.setOnEditorActionListener(
        (v, action, event) -> {
          signIn.performClick();
          return true;
        });
  }

  private void biometrics(
      Cipher cipher, String title, java.util.function.Consumer<Cipher> success) {
    biometrics(cipher, title, success, null);
  }

  private void biometrics(
      Cipher cipher, String title, java.util.function.Consumer<Cipher> success, Runnable skipped) {
    busy = true;
    int promptGeneration = generation;
    BiometricPrompt prompt =
        new BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            new BiometricPrompt.AuthenticationCallback() {
              @Override
              public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                if (promptGeneration != generation || backgrounded || isFinishing()) return;
                busy = false;
                if (result.getCryptoObject() != null)
                  success.accept(result.getCryptoObject().getCipher());
              }

              @Override
              public void onAuthenticationError(int code, CharSequence text) {
                busy = false;
                if (promptGeneration != generation || backgrounded || isFinishing()) return;
                if (skipped != null) {
                  vault.remove();
                  skipped.run();
                  return;
                }
                if (!unlocked)
                  status.setText("Biometric sign-in cancelled. Try again or use your password.");
              }
            });
    prompt.authenticate(
        new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText(skipped == null ? "Use password" : "Not now")
            .build(),
        new BiometricPrompt.CryptoObject(cipher));
  }

  private void unlock() {
    if (busy || unlocked || !vault.exists()) return;
    try {
      biometrics(
          vault.decryptor(),
          "Unlock GDG Workspace",
          cipher -> {
            try {
              authenticate(
                  new JSONObject(new String(vault.read(cipher), StandardCharsets.UTF_8)),
                  true,
                  false);
            } catch (Exception e) {
              vault.remove();
              showSignIn("Biometric sign-in needs to be set up again. Sign in with your password.");
            }
          });
    } catch (Exception e) {
      vault.remove();
      showSignIn("Biometric sign-in needs to be set up again. Sign in with your password.");
    }
  }

  private void authenticate(JSONObject credentials, boolean restore, boolean remember) {
    if (!compatible) {
      status.setText("Update Android System WebView, then reopen GDG Workspace.");
      return;
    }
    busy = true;
    status.setText("Signing in…");
    int attempt = ++generation;
    work.execute(
        () -> {
          try {
            boolean changed = SignIn.authenticate(credentials, restore);
            runOnUiThread(
                () -> {
                  if (attempt != generation || isFinishing()) return;
                  busy = false;
                  if (!restore && !remember) vault.remove();
                  if (remember
                      && BiometricManager.from(this)
                              .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                          == BiometricManager.BIOMETRIC_SUCCESS) {
                    try {
                      Cipher cipher = vault.encryptor();
                      biometrics(
                          cipher,
                          "Remember your GDG account",
                          authorized -> {
                            try {
                              vault.save(
                                  authorized,
                                  credentials.toString().getBytes(StandardCharsets.UTF_8));
                              openWorkspace(changed);
                            } catch (Exception e) {
                              openWorkspace(changed);
                              toast("Signed in. Biometric sign-in could not be saved.");
                            }
                          },
                          () -> openWorkspace(changed));
                    } catch (Exception e) {
                      openWorkspace(changed);
                      toast("Signed in. Biometric sign-in could not be saved.");
                    }
                  } else {
                    openWorkspace(changed);
                    if (remember)
                      toast(
                          "Signed in. Set up a strong fingerprint or face biometric to remember"
                              + " your account.");
                  }
                });
          } catch (Exception e) {
            runOnUiThread(
                () -> {
                  if (attempt != generation) return;
                  busy = false;
                  status.setText(
                      e.getMessage() == null
                          ? "Sign-in could not finish. Try again."
                          : e.getMessage());
                });
          }
        });
  }

  private void openWorkspace(boolean changed) {
    unlocked = true;
    content.removeAllViews();
    content.addView(web);
    web.onResume();
    tabs.setVisibility(View.VISIBLE);
    configureToolbar();
    if (!hasWorkspace || changed) {
      hasWorkspace = true;
      destinations.clear();
      path = "/admin";
      web.loadUrl(Policy.ORIGIN + "/admin");
    }
  }

  private void lock() {
    if (!unlocked) return;
    generation++;
    blobExport.cancel();
    cancelNfc("Scan cancelled.");
    denyCamera();
    web.onPause();
    showSignIn("");
  }

  private void forget() {
    vault.remove();
    hasWorkspace = false;
    destinations.clear();
    web.stopLoading();
    web.loadUrl("about:blank");
    web.clearHistory();
    web.clearCache(true);
    WebStorage.getInstance().deleteAllData();
    CookieManager.getInstance().removeAllCookies(null);
    clearExports();
    showSignIn("");
  }

  private void configureToolbar() {
    toolbar.getMenu().clear();
    toolbar.setTitle(destinations.getOrDefault(path, "GDG Workspace"));
    toolbar.setNavigationIcon(destinations.containsKey(path) ? null : R.drawable.ic_back);
    toolbar.setNavigationContentDescription("Back");
    toolbar.setNavigationOnClickListener(v -> navigate("back"));
    toolbar
        .getMenu()
        .add("Notifications")
        .setIcon(R.drawable.ic_bell)
        .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
    toolbar.getMenu().add("Find a tool");
    toolbar.getMenu().add("Reload");
    toolbar.getMenu().add("Lock app");
    toolbar.getMenu().add("Sign out and forget account");
    toolbar.setOnMenuItemClickListener(
        item -> {
          switch (item.getTitle().toString()) {
            case "Notifications" -> navigate("notifications");
            case "Find a tool" -> showTools();
            case "Reload" -> navigate("reload");
            case "Lock app" -> lock();
            case "Sign out and forget account" -> navigate("signOut");
          }
          return true;
        });
  }

  private void showTools() {
    if (!unlocked) return;
    List<String> paths = new ArrayList<>(destinations.keySet());
    List<String> labels = new ArrayList<>(destinations.values());
    new AlertDialog.Builder(this)
        .setTitle("Chapter tools")
        .setItems(labels.toArray(new String[0]), (dialog, index) -> navigate(paths.get(index)))
        .setNegativeButton("Close", null)
        .show();
  }

  private void navigate(String destination) {
    if (!unlocked || !Policy.admin(web.getUrl())) return;
    if (destination.equals("reload") && !navigationReady) {
      web.reload();
      return;
    }
    if (!Set.of("back", "reload", "signOut", "notifications", "search").contains(destination)
        && !destinations.containsKey(destination)) return;
    web.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('gdg:native-navigation',{detail:"
            + JSONObject.quote(destination)
            + "}))",
        null);
  }

  private void createWeb() {
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(247, 247, 245));
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setMediaPlaybackRequiresUserGesture(true);
    settings.setSaveFormData(false);
    settings.setSupportMultipleWindows(false);
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      compatible = false;
      return;
    }
    WebViewCompat.addWebMessageListener(
        web,
        "GDGNative",
        Set.of(Policy.ORIGIN),
        (view, message, origin, mainFrame, reply) -> {
          if (!mainFrame
              || !Policy.trusted(origin.toString())
              || !Policy.admin(view.getUrl())
              || message.getData() == null
              || message.getData().length() > 20000) return;
          try {
            JSONObject envelope = new JSONObject(message.getData()),
                body = envelope.getJSONObject("body");
            if (envelope.optString("kind").equals("export")) receiveExport(body);
            else if (envelope.optString("kind").equals("admin")) receiveAdmin(body);
            else if (envelope.optString("kind").equals("scanner")) receiveScanner(body);
          } catch (JSONException ignored) {
          }
        });
    WebViewCompat.addDocumentStartJavaScript(web, SHIM, Set.of(Policy.ORIGIN));
    try (InputStream asset = getAssets().open("blob-exports.js")) {
      ByteArrayOutputStream source = new ByteArrayOutputStream();
      byte[] bytes = new byte[4096];
      int n;
      while ((n = asset.read(bytes)) != -1) source.write(bytes, 0, n);
      WebViewCompat.addDocumentStartJavaScript(
          web, source.toString(StandardCharsets.UTF_8.name()), Set.of(Policy.ORIGIN));
    } catch (IOException e) {
      compatible = false;
    }
    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            String url = request.getUrl().toString();
            if (Policy.admin(url) || Policy.download(url)) return false;
            if (Policy.trusted(url)) {
              lock();
              return true;
            }
            if (Policy.external(url)
                && (request.hasGesture()
                    || (request.getUrl().getHost() != null
                        && request.getUrl().getHost().equals("pay.google.com")
                        && request.getUrl().getPath().startsWith("/gp/v/save/")))) external(url);
            return true;
          }

          @Override
          public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
            navigationReady = false;
            blobExport.cancel();
            cancelNfc("Page changed. Start scanning again.");
            progress.setVisibility(unlocked ? View.VISIBLE : View.GONE);
          }

          @Override
          public void onReceivedError(
              WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && unlocked) {
              progress.setVisibility(View.GONE);
              new AlertDialog.Builder(WorkspaceActivity.this)
                  .setTitle("Couldn’t load workspace")
                  .setMessage("Check your connection and try again.")
                  .setPositiveButton("Try again", (d, w) -> web.reload())
                  .setNegativeButton("Close", null)
                  .show();
            }
          }

          @Override
          public void onReceivedSslError(
              WebView view, SslErrorHandler ssl, android.net.http.SslError error) {
            ssl.cancel();
            toast("A secure connection could not be established.");
          }

          @Override
          public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            generation++;
            cancelNfc(null);
            denyCamera();
            blobExport.cancel();
            content.removeView(view);
            view.destroy();
            hasWorkspace = false;
            unlocked = false;
            createWeb();
            showSignIn("The workspace closed to free memory. Unlock to reopen it.");
            return true;
          }
        });
    web.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public void onProgressChanged(WebView view, int value) {
            progress.setProgress(value);
            if (value == 100) progress.setVisibility(View.GONE);
          }

          @Override
          public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(
                () -> {
                  if (!unlocked
                      || !Policy.admin(web.getUrl())
                      || !Policy.trusted(request.getOrigin().toString())
                      || !Arrays.equals(
                          request.getResources(),
                          new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE})) {
                    request.deny();
                    return;
                  }
                  denyCamera();
                  cameraRequest = request;
                  if (ContextCompat.checkSelfPermission(
                          WorkspaceActivity.this, Manifest.permission.CAMERA)
                      == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    cameraRequest = null;
                  } else {
                    pickerOpen = true;
                    cameraPermission.launch(Manifest.permission.CAMERA);
                  }
                });
          }

          @Override
          public void onPermissionRequestCanceled(PermissionRequest request) {
            if (cameraRequest == request) cameraRequest = null;
          }

          @Override
          public boolean onShowFileChooser(
              WebView view, ValueCallback<Uri[]> callback, FileChooserParams parameters) {
            if (!unlocked || !Policy.admin(web.getUrl())) {
              callback.onReceiveValue(null);
              return true;
            }
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            pickerOpen = true;
            try {
              filePicker.launch(parameters.createIntent());
            } catch (Exception e) {
              pickerOpen = false;
              fileCallback = null;
              callback.onReceiveValue(null);
              toast("No file picker is available.");
            }
            return true;
          }

          @Override
          public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            if (!unlocked || !Policy.admin(url)) {
              result.cancel();
              return true;
            }
            new AlertDialog.Builder(WorkspaceActivity.this)
                .setMessage(message)
                .setPositiveButton("Continue", (d, w) -> result.confirm())
                .setNegativeButton("Cancel", (d, w) -> result.cancel())
                .setOnCancelListener(d -> result.cancel())
                .show();
            return true;
          }

          @Override
          public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            if (!unlocked || !Policy.admin(url)) {
              result.cancel();
              return true;
            }
            new AlertDialog.Builder(WorkspaceActivity.this)
                .setMessage(message)
                .setPositiveButton("OK", (d, w) -> result.confirm())
                .setOnCancelListener(d -> result.cancel())
                .show();
            return true;
          }
        });
    web.setDownloadListener(
        (url, userAgent, disposition, mime, length) -> {
          if (unlocked && Policy.admin(web.getUrl()) && Policy.download(url)) download(url, mime);
          else toast("This download is unavailable in the app. Open the website to export it.");
        });
  }

  private void receiveAdmin(JSONObject body) throws JSONException {
    String action = body.optString("action");
    if (action.equals("signedOut")) {
      forget();
      return;
    }
    if (!unlocked) return;
    if (action.equals("authRequired")) {
      hasWorkspace = false;
      lock();
      return;
    }
    if (action.equals("state")) {
      String current = body.optString("path");
      JSONArray rows = body.optJSONArray("destinations");
      if (!Policy.admin(Policy.ORIGIN + current)
          || !current.startsWith("/admin")
          || rows == null
          || rows.length() > 60) return;
      if (!path.equals(current)) {
        cancelNfc("Page changed. Start scanning again.");
        blobExport.cancel();
      }
      path = current;
      navigationReady = true;
      destinations.clear();
      for (int i = 0; i < rows.length(); i++) {
        JSONObject row = rows.getJSONObject(i);
        String target = row.optString("path"), title = row.optString("title");
        if (target.startsWith("/admin")
            && !target.contains("?")
            && !target.contains("#")
            && Policy.admin(Policy.ORIGIN + target)
            && title.length() <= 100) destinations.put(target, title);
      }
      configureToolbar();
      toolbar.setTitle(body.optString("title", "GDG Workspace"));
      String[] primary = {"/admin", "/admin/events", "/admin/rewards", "/admin/members"};
      for (int i = 0; i < 4; i++) {
        tabs.getMenu().findItem(i + 1).setVisible(destinations.containsKey(primary[i]));
        tabs.getMenu().findItem(i + 1).setChecked(path.equals(primary[i]));
      }
    }
  }

  private void receiveScanner(JSONObject body) {
    if (!unlocked || !Policy.rewards(web.getUrl())) return;
    String id = body.optString("id"), action = body.optString("action");
    try {
      UUID.fromString(id);
    } catch (Exception e) {
      return;
    }
    if (action.equals("cancel")) {
      if (id.equals(pendingId)) cancelNfc("Scan cancelled.");
      return;
    }
    if (pendingId != null) {
      reply(id, null, "Finish the current scan first.");
      return;
    }
    if (action.equals("readWallet")) {
      reply(
          id,
          null,
          "Google Wallet NFC needs a certified Smart Tap reader. Use the pass QR code here.");
      return;
    }
    if (!Set.of("readCard", "writeCard").contains(action)) return;
    String url = body.optString("url");
    if (action.equals("writeCard") && !Policy.writable(url)) {
      reply(id, null, "This is not a GDG card URL.");
      return;
    }
    if (nfc == null || !nfc.isEnabled()) {
      reply(id, null, "NFC is unavailable or disabled. Enable NFC or use the QR camera.");
      return;
    }
    pendingId = id;
    pendingDocument = web.getUrl();
    pendingGeneration = generation;
    scanDialog =
        new AlertDialog.Builder(this)
            .setTitle(action.equals("writeCard") ? "Write blank member card?" : "Read member card?")
            .setMessage(
                action.equals("writeCard")
                    ? "Hold a blank, rewritable NDEF card near the phone. Existing cards will not"
                        + " be overwritten."
                    : "Hold the physical member card near your phone’s NFC reader.")
            .setNegativeButton("Cancel", (d, w) -> cancelNfc("Scan cancelled."))
            .setPositiveButton("Start", (d, w) -> startNfc(action, url))
            .setOnCancelListener(d -> cancelNfc("Scan cancelled."))
            .create();
    scanDialog.show();
  }

  private void startNfc(String action, String url) {
    if (pendingId == null || !unlocked || !Policy.rewards(web.getUrl())) {
      cancelNfc("Scan cancelled.");
      return;
    }
    String id = pendingId;
    scanDialog =
        new AlertDialog.Builder(this)
            .setTitle(action.equals("writeCard") ? "Ready to write" : "Ready to scan")
            .setMessage("Hold the card still near the NFC reader.")
            .setNegativeButton("Cancel", (d, w) -> cancelNfc("Scan cancelled."))
            .setOnCancelListener(d -> cancelNfc("Scan cancelled."))
            .show();
    try {
      nfc.enableReaderMode(
          this,
          tag ->
              work.execute(
                  () -> {
                    String value = null, error = null;
                    try {
                      if (!id.equals(pendingId)) return;
                      value = action.equals("writeCard") ? writeCard(tag, url, id) : readCard(tag);
                    } catch (Exception e) {
                      error =
                          e.getMessage() == null
                              ? "Card could not be read. Try again."
                              : e.getMessage();
                    }
                    String found = value, failed = error;
                    runOnUiThread(
                        () -> {
                          if (!id.equals(pendingId)) return;
                          boolean valid =
                              unlocked
                                  && generation == pendingGeneration
                                  && Objects.equals(pendingDocument, web.getUrl());
                          cancelNfc(null);
                          if (valid) reply(id, found, failed);
                        });
                  }),
          NfcAdapter.FLAG_READER_NFC_A
              | NfcAdapter.FLAG_READER_NFC_B
              | NfcAdapter.FLAG_READER_NFC_F
              | NfcAdapter.FLAG_READER_NFC_V,
          null);
      handler.postDelayed(
          () -> {
            if (id.equals(pendingId)) cancelNfc("NFC timed out. Try again.");
          },
          60000);
    } catch (Exception e) {
      cancelNfc("NFC could not start. Try again.");
    }
  }

  private String readCard(Tag tag) throws Exception {
    Ndef tech = Ndef.get(tag);
    if (tech == null) throw new Exception("Use a compatible NDEF member card.");
    try {
      tech.connect();
      NdefMessage message = tech.getNdefMessage();
      if (message != null)
        for (NdefRecord record : message.getRecords()) {
          Uri uri = record.toUri();
          if (uri != null && Policy.token(uri.toString()) != null)
            return Policy.token(uri.toString());
        }
      throw new Exception("No GDG credential was found on this card.");
    } finally {
      tech.close();
    }
  }

  private String writeCard(Tag tag, String url, String requestId) throws Exception {
    NdefMessage message = new NdefMessage(NdefRecord.createUri(url));
    Ndef tech = Ndef.get(tag);
    if (tech != null) {
      try {
        tech.connect();
        NdefMessage existing = tech.getNdefMessage();
        if (existing != null)
          for (NdefRecord record : existing.getRecords())
            if (record.getTnf() != NdefRecord.TNF_EMPTY)
              throw new Exception("This card already contains data. Use a blank card.");
        if (!tech.isWritable() || tech.getMaxSize() < message.toByteArray().length)
          throw new Exception("This card is locked or too small.");
        if (!requestId.equals(pendingId)) throw new InterruptedIOException("Scan cancelled.");
        tech.writeNdefMessage(message);
        NdefMessage verified = tech.getNdefMessage();
        if (verified == null || !Arrays.equals(message.toByteArray(), verified.toByteArray()))
          throw new Exception(
              "The write could not be verified. Scan the card before handing it out.");
      } finally {
        tech.close();
      }
    } else {
      throw new Exception(
          "This card is not NDEF formatted. Format a blank NFC card first, then try again.");
    }
    return url;
  }

  private void cancelNfc(String error) {
    String id = pendingId;
    pendingId = null;
    if (nfc != null)
      try {
        nfc.disableReaderMode(this);
      } catch (Exception ignored) {
      }
    if (scanDialog != null) {
      scanDialog.dismiss();
      scanDialog = null;
    }
    if (error != null && id != null && unlocked) reply(id, null, error);
  }

  private void reply(String id, String value, String error) {
    try {
      JSONObject data = new JSONObject().put("id", id);
      if (error != null) data.put("error", error);
      else data.put("value", value);
      web.evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('gdg:scanner-result',{detail:" + data + "}))",
          null);
    } catch (JSONException ignored) {
    }
  }

  private void denyCamera() {
    if (cameraRequest != null) {
      cameraRequest.deny();
      cameraRequest = null;
    }
  }

  private void external(String url) {
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    } catch (Exception e) {
      toast("No app can open this link.");
    }
  }

  private void toast(String message) {
    Toast.makeText(this, message, Toast.LENGTH_LONG).show();
  }

  private void clearExports() {
    File dir = new File(getCacheDir(), "exports");
    File[] files = dir.listFiles();
    if (files != null) for (File file : files) if (file.isFile()) file.delete();
  }

  private void receiveExport(JSONObject body) {
    if (!unlocked || !Policy.admin(web.getUrl())) return;
    String id = body.optString("id");
    try {
      BlobExport.Ready ready = blobExport.receive(body);
      web.evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('gdg:export-ack',{detail:{id:"
              + JSONObject.quote(id)
              + "}}))",
          null);
      if (ready != null) share(ready.file(), ready.mime(), generation);
    } catch (Exception e) {
      blobExport.cancel();
      web.evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('gdg:export-ack',{detail:{id:"
              + JSONObject.quote(id)
              + ",error:'Export could not finish'}}))",
          null);
    }
  }

  private void share(File ready, String type, int attempt) {
    if (attempt != generation || !unlocked) {
      ready.delete();
      return;
    }
    Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", ready);
    Intent intent =
        new Intent(Intent.ACTION_SEND)
            .setType(type)
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    try {
      pickerOpen = true;
      startActivity(Intent.createChooser(intent, "Save or share export"));
    } catch (Exception e) {
      pickerOpen = false;
      ready.delete();
      toast("No app can save this export.");
    }
  }

  private void download(String url, String mime) {
    int attempt = generation;
    String cookies = CookieManager.getInstance().getCookie(Policy.ORIGIN);
    toast("Preparing download…");
    work.execute(
        () -> {
          File result = null;
          try {
            HttpsURLConnection c = (HttpsURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            if (cookies != null) c.setRequestProperty("Cookie", cookies);
            try {
              if (c.getResponseCode() != 200) throw new IOException();
              String type = c.getContentType();
              if (type == null) throw new IOException();
              type = type.split(";")[0].toLowerCase(Locale.ROOT);
              Map<String, String> extensions =
                  Map.of(
                      "application/pdf",
                      "pdf",
                      "text/csv",
                      "csv",
                      "application/json",
                      "json",
                      "application/zip",
                      "zip",
                      "application/octet-stream",
                      "bin",
                      "application/vnd.apple.pkpass",
                      "pkpass",
                      "image/png",
                      "png",
                      "image/jpeg",
                      "jpg",
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      "xlsx");
              String ext = extensions.get(type);
              if (ext == null) throw new IOException();
              File dir = new File(getCacheDir(), "exports");
              dir.mkdirs();
              result = File.createTempFile("GDG-export-", "." + ext, dir);
              try (InputStream in = c.getInputStream();
                  OutputStream out = new FileOutputStream(result)) {
                byte[] bytes = new byte[8192];
                long count = 0;
                int n;
                while ((n = in.read(bytes)) != -1) {
                  count += n;
                  if (count > 64L * 1024 * 1024 || attempt != generation) throw new IOException();
                  out.write(bytes, 0, n);
                }
              }
              File ready = result;
              String contentType = type;
              runOnUiThread(() -> share(ready, contentType, attempt));
            } finally {
              c.disconnect();
            }
          } catch (Exception e) {
            if (result != null) result.delete();
            runOnUiThread(() -> toast("The download could not finish. Try again when connected."));
          }
        });
  }

  @Override
  protected void onStop() {
    super.onStop();
    backgrounded = true;
    if (!pickerOpen) {
      if (busy) {
        generation++;
        busy = false;
      }
      lock();
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (backgrounded) {
      backgrounded = false;
      pickerOpen = false;
      if (!unlocked && vault != null && vault.exists()) content.post(this::unlock);
    }
  }

  @Override
  protected void onDestroy() {
    generation++;
    if (blobExport != null) blobExport.cancel();
    cancelNfc(null);
    denyCamera();
    if (fileCallback != null) fileCallback.onReceiveValue(null);
    if (web != null) web.destroy();
    work.shutdownNow();
    super.onDestroy();
  }
}
