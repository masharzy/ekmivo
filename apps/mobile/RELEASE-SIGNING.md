# Ekmivo production signing (Android)

This repository **does not contain the production signing key or its password**. To build a production APK, use the manual GitHub Actions workflow `Signed Android production APK` with the repository Actions secrets below.

1. Store secure offline backups of the owner-provided `ekmivo-production-release.jks` and its separate credentials. Never place either file or password in a commit, issue, PR or Actions log.
2. In GitHub repository **Settings > Secrets and variables > Actions**, create **two repository secrets**:
   - `EKMIVO_ANDROID_KEYSTORE_B64`: a one-line Base64 encoding of the complete keystore file (NOT a password). Base64 is not encryption; paste it only in a GitHub **secret**.
   - `EKMIVO_ANDROID_KEYSTORE_PASSWORD`: the keystore password from the separate owner credentials file. PKCS12 uses the same key password.
3. From the repository **Actions** tab, select **Signed Android production APK** > **Run workflow**. This manual-only workflow decrypts the Base64 keystore within the runner, signs `:app:assembleRelease`, checks APK signature with `apksigner` and fails closed if the signing certificate differs.
4. After success, download the `ekmivo-production-release-apk` artifact and keep its SHA-256 digest with the release records. The certificate is pinned to `52:F5:4E:EF:5B:FE:B3:51:A0:C2:D6:15:E1:19:10:48:E3:0F:17:01:B2:9F:36:AA:A8:25:35:9C:A9:72:76:D9`.
5. For future in-app upgrades, retain **this exact signing identity**, increase the Android `versionCode`, host the release APK on HTTPS and configure the Go release manifest with its correct hash and version. Android will still require user approval to install a sideloaded APK.

**Important:** Previously distributed debug APKs use a different signing certificate and generally **cannot be upgraded in place** to this production APK. Users may have to uninstall the debug APK first. Before uninstalling, make sure any unsent SMS evidence has been delivered; uninstalling may remove local data/pairing and require a new pairing.

Do not lose the private key/password. A new key cannot freely replace the original signing identity for existing sideloaded installations. A successful CI build or key generation does not itself count as real-device QA.
