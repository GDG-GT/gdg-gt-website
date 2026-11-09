package dev.gdggt.workspace;

import static org.junit.Assert.*;

import java.io.*;
import java.nio.file.Files;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.Test;

public class BlobExportTest {
  private final String id = UUID.randomUUID().toString();

  private JSONObject message(String action) throws Exception {
    return new JSONObject().put("id", id).put("action", action);
  }

  @Test
  public void exportsExactBytesAndDoesNotUseWebFilenames() throws Exception {
    File dir = Files.createTempDirectory("gdg-export-test").toFile();
    BlobExport export = new BlobExport(dir);
    export.receive(
        message("begin")
            .put("size", 3)
            .put("mime", "text/csv;charset=utf-8")
            .put("name", "../../private"));
    export.receive(message("chunk").put("offset", 0).put("data", "YWJj"));
    BlobExport.Ready ready = export.receive(message("finish"));
    assertArrayEquals("abc".getBytes(), Files.readAllBytes(ready.file().toPath()));
    assertEquals(dir, ready.file().getParentFile());
    assertTrue(ready.file().getName().endsWith(".csv"));
    ready.file().delete();
    dir.delete();
  }

  @Test
  public void rejectsHtmlOversizeWrongOffsetsAndPartialFiles() throws Exception {
    File dir = Files.createTempDirectory("gdg-export-rejection").toFile();
    BlobExport export = new BlobExport(dir);
    assertThrows(
        IOException.class,
        () -> export.receive(message("begin").put("size", 4).put("mime", "text/html")));
    assertThrows(
        IOException.class,
        () ->
            export.receive(
                message("begin").put("size", 64L * 1024 * 1024 + 1).put("mime", "text/csv")));
    export.receive(message("begin").put("size", 4).put("mime", "text/csv"));
    assertThrows(
        IOException.class,
        () -> export.receive(message("chunk").put("offset", 1).put("data", "YWJj")));
    assertThrows(IOException.class, () -> export.receive(message("finish")));
    export.cancel();
    assertEquals(0, dir.list().length);
    dir.delete();
  }

  @Test
  public void refusesOtherRequestsAndExcessBytes() throws Exception {
    File dir = Files.createTempDirectory("gdg-export-isolation").toFile();
    BlobExport export = new BlobExport(dir);
    export.receive(message("begin").put("size", 2).put("mime", "text/csv"));
    assertThrows(
        IOException.class,
        () -> export.receive(message("chunk").put("offset", 0).put("data", "YWJj")));
    assertThrows(
        IOException.class,
        () -> export.receive(message("finish").put("id", UUID.randomUUID().toString())));
    export.cancel();
    assertThrows(IOException.class, () -> export.receive(message("finish")));
    dir.delete();
  }
}
