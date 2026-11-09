package dev.gdggt.workspace;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Only ciphertext is persisted; every key operation requires a strong biometric. */
final class AccountVault {
  private static final String ALIAS = "gdg-officer-v1";
  private final SharedPreferences storage;

  AccountVault(Context context) {
    storage = context.getSharedPreferences("officer", Context.MODE_PRIVATE);
  }

  boolean exists() {
    return storage.contains("ciphertext");
  }

  void remove() {
    storage.edit().clear().apply();
    try {
      KeyStore k = KeyStore.getInstance("AndroidKeyStore");
      k.load(null);
      k.deleteEntry(ALIAS);
    } catch (Exception ignored) {
    }
  }

  Cipher encryptor() throws Exception {
    remove();
    KeyGenerator generator =
        KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(
        new KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationValidityDurationSeconds(-1)
            .setInvalidatedByBiometricEnrollment(true)
            .build());
    SecretKey key = generator.generateKey();
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key);
    return cipher;
  }

  void save(Cipher cipher, byte[] data) throws Exception {
    storage
        .edit()
        .putString("ciphertext", Base64.encodeToString(cipher.doFinal(data), Base64.NO_WRAP))
        .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
        .apply();
  }

  Cipher decryptor() throws Exception {
    KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
    keys.load(null);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
        Cipher.DECRYPT_MODE,
        keys.getKey(ALIAS, null),
        new GCMParameterSpec(128, Base64.decode(storage.getString("iv", ""), Base64.NO_WRAP)));
    return cipher;
  }

  byte[] read(Cipher cipher) throws Exception {
    return cipher.doFinal(Base64.decode(storage.getString("ciphertext", ""), Base64.NO_WRAP));
  }
}
