#!/usr/bin/env python3
"""Build and verify a sideload APK using an existing private, local signing key."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

project = Path(__file__).resolve().parent
root = project.parent.parent
private = Path.home() / "Library/Application Support/GDG GT/Android Signing"
keystore = Path(os.environ.get("GDG_ANDROID_KEYSTORE", private / "gdg-workspace.jks"))
password_file = Path(os.environ.get("GDG_ANDROID_PASSWORD_FILE", private / "keystore-password.local"))
if not keystore.is_file() or not password_file.is_file():
    raise SystemExit("Existing private Android signing key/password file are required. See ANDROID_WORKSPACE.md.")
env = os.environ.copy()
env["GDG_ANDROID_KEYSTORE"] = str(keystore)
env["GDG_ANDROID_STORE_PASSWORD"] = password_file.read_text().strip()
env.setdefault("ANDROID_HOME", str(Path.home() / "Library/Android/sdk"))
if "JAVA_HOME" not in env:
    env["JAVA_HOME"] = subprocess.check_output(["/usr/libexec/java_home", "-v", "17"], text=True).strip()
subprocess.run([str(project / "gradlew"), "-p", str(project), ":app:assembleRelease", ":app:testReleaseUnitTest", ":app:lintRelease", "--console", "plain"], env=env, check=True)
output_root = Path(env.get("GDG_ANDROID_BUILD_DIR", Path.home() / "Library/Caches/GDG GT/Android"))
source = output_root / "app/outputs/apk/release/app-release.apk"
tools = Path(env["ANDROID_HOME"]) / "build-tools/35.0.0"
certificate = subprocess.check_output([str(tools / "apksigner"), "verify", "--verbose", "--print-certs", str(source)], env=env, text=True)
badging = subprocess.check_output([str(tools / "aapt"), "dump", "badging", str(source)], env=env, text=True)
if "application-debuggable" in badging:
    raise SystemExit("Refusing to distribute a debuggable APK")
destination = root / "artifacts/android/GDG-Workspace-1.0.0.apk"
destination.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source, destination)
destination.chmod(0o644)
digest = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix(".apk.sha256").write_text(digest + "  " + destination.name + "\n")
print(certificate)
print(json.dumps({"apk": str(destination), "sha256": digest, "bytes": destination.stat().st_size, "playStoreUpload": False}, indent=2))
