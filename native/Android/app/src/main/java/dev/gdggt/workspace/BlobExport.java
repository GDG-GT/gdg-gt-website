package dev.gdggt.workspace;

import java.io.*;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;

/** One bounded export at a time. Web filenames never become filesystem paths. */
final class BlobExport {
  private static final Map<String, String> EXTENSIONS =
      Map.ofEntries(
          Map.entry("text/csv", "csv"),
          Map.entry("application/json", "json"),
          Map.entry("application/pdf", "pdf"),
          Map.entry("application/zip", "zip"),
          Map.entry("text/plain", "txt"),
          Map.entry("image/png", "png"),
          Map.entry("image/jpeg", "jpg"),
          Map.entry("image/webp", "webp"),
          Map.entry("application/octet-stream", "bin"),
          Map.entry("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"));
  private final File directory;
  private String id, mime;
  private long expected, count;
  private File file;
  private OutputStream stream;

  BlobExport(File directory) {
    this.directory = directory;
  }

  record Ready(File file, String mime) {}

  Ready receive(JSONObject body) throws Exception {
    String requestId = body.getString("id"), action = body.getString("action");
    UUID.fromString(requestId);
    if (action.equals("begin")) {
      if (id != null) throw new IOException("Finish the current export first.");
      long size = body.getLong("size");
      String type = body.getString("mime").split(";")[0].toLowerCase(java.util.Locale.ROOT);
      String ext = EXTENSIONS.get(type);
      if (size < 0 || size > 64L * 1024 * 1024 || ext == null)
        throw new IOException("Unsupported export.");
      directory.mkdirs();
      file = File.createTempFile("GDG-export-", "." + ext, directory);
      stream = new FileOutputStream(file);
      id = requestId;
      expected = size;
      count = 0;
      mime = type;
      return null;
    }
    if (!requestId.equals(id)) throw new IOException("Export expired.");
    if (action.equals("cancel")) {
      cancel();
      return null;
    }
    if (action.equals("chunk")) {
      String data = body.getString("data");
      if (data.length() > 11000 || body.getLong("offset") != count)
        throw new IOException("Invalid export chunk.");
      byte[] bytes = Base64.getDecoder().decode(data);
      if (bytes.length > 8192 || count + bytes.length > expected)
        throw new IOException("Export is too large.");
      stream.write(bytes);
      count += bytes.length;
      return null;
    }
    if (action.equals("finish") && count == expected) {
      stream.close();
      Ready ready = new Ready(file, mime);
      id = null;
      stream = null;
      file = null;
      return ready;
    }
    throw new IOException("Incomplete export.");
  }

  void cancel() {
    try {
      if (stream != null) stream.close();
    } catch (IOException ignored) {
    }
    if (file != null) file.delete();
    id = null;
    stream = null;
    file = null;
  }
}
