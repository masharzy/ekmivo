#!/usr/bin/env bash
# Isolated CI-independent debug APK build for a free Render static-site builder.
# No payment credentials, keystore secrets or production signing keys.
set -Eeuo pipefail
ROOT="$(pwd)"
CACHE="${ROOT}/.android-build"
mkdir -p "$CACHE" "$ROOT/apk-dist"
export JAVA_HOME="$CACHE/jdk"
export ANDROID_HOME="$CACHE/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="$CACHE/gradle-cache"
export PATH="$JAVA_HOME/bin:$CACHE/gradle-8.9/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

download() {
  curl --fail --location --silent --show-error --retry 4 --retry-delay 5 --connect-timeout 35 "$1" -o "$2"
}

if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  mkdir -p "$JAVA_HOME"
  echo "[APK] Installing Eclipse Temurin JDK 17"
  download "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse" "$CACHE/jdk17.tar.gz"
  tar -xzf "$CACHE/jdk17.tar.gz" -C "$JAVA_HOME" --strip-components=1
  rm -f "$CACHE/jdk17.tar.gz"
fi
java -version

if [[ ! -x "$CACHE/gradle-8.9/bin/gradle" ]]; then
  echo "[APK] Installing Gradle 8.9"
  download "https://services.gradle.org/distributions/gradle-8.9-bin.zip" "$CACHE/gradle.zip"
  unzip -q "$CACHE/gradle.zip" -d "$CACHE"
  rm -f "$CACHE/gradle.zip"
fi

if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  echo "[APK] Installing Android command-line tools"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  download "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" "$CACHE/cmdline-tools.zip"
  mkdir -p "$CACHE/sdk-tools"
  unzip -q "$CACHE/cmdline-tools.zip" -d "$CACHE/sdk-tools"
  mv "$CACHE/sdk-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$CACHE/cmdline-tools.zip" "$CACHE/sdk-tools"
fi

echo "[APK] Installing SDK Android 35 and build tools"
set +o pipefail
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses > /dev/null
set -o pipefail
sdkmanager --sdk_root="$ANDROID_HOME" "platforms;android-35" "build-tools;35.0.0" "platform-tools"

echo "[APK] Compiling Ekmivo Android developer build"
(
  cd "$ROOT/apps/mobile"
  gradle :app:assembleDebug :app:testDebugUnitTest \
    --no-daemon --max-workers=2 --stacktrace \
    -Dorg.gradle.jvmargs="-Xmx1792m -Dfile.encoding=UTF-8"
)
APK="$ROOT/apps/mobile/app/build/outputs/apk/debug/app-debug.apk"
test -s "$APK"
cp "$APK" "$ROOT/apk-dist/ekmivo-v0.2.1-debug.apk"
(cd "$ROOT/apk-dist"; sha256sum ekmivo-v0.2.1-debug.apk > SHA256SUMS.txt)
cat > "$ROOT/apk-dist/index.html" <<'HTML'
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ekmivo Android test build</title>
<style>body{font:16px system-ui,sans-serif;max-width:540px;margin:12vh auto;padding:24px;background:#f7f7f3;color:#20211f}a{display:inline-block;background:#171717;color:white;padding:14px 20px;border-radius:10px;text-decoration:none}small{display:block;margin-top:20px;color:#555}h1{letter-spacing:-.04em}</style>
<h1>Ekmivo Android</h1><p>Debug test APK. Pair your Android device from Ekmivo SMS Devices after installing. SMS permissions are requested with your consent.</p>
<a href="./ekmivo-v0.2.1-debug.apk" download>Download Android test APK</a>
<small>Test build, not production-signed. Only install if you trust this Ekmivo build. Do not share your pairing codes.</small>
</html>
HTML
echo "[APK] Debug APK ready: $(du -h "$APK" | cut -f1)"
sha256sum "$APK"
