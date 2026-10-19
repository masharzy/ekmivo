plugins {
 id("com.android.application")
 id("org.jetbrains.kotlin.android")
 id("org.jetbrains.kotlin.plugin.compose")
 id("org.jetbrains.kotlin.kapt")
}

android {
 namespace = "com.ekmivo.mobile"
 compileSdk = 35
 defaultConfig {
  applicationId = "com.ekmivo.mobile"
  minSdk = 26
  targetSdk = 35
  versionCode = 4
  versionName = "0.2.2"
  testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  // Firebase client identifiers are public configuration, never service-account secrets.
  for (key in listOf("APPLICATION_ID", "API_KEY", "PROJECT_ID", "SENDER_ID")) {
   val value = providers.environmentVariable("EKMIVO_FIREBASE_" + key).orElse("").get()
   buildConfigField("String", "FIREBASE_" + key, "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"")
  }
  // Public origin only: never embed credentials or a payment authority in a mobile binary.
  buildConfigField("String", "API_BASE_URL",
    "\"" + (providers.gradleProperty("ekmivoApiBaseUrl").orElse("https://ekmivo-go-api.onrender.com").get().trimEnd('/')) + "\"")
 }
 // The production key comes ONLY from environment variables at build time.
 // No keystore, key password, or private key is committed to this repo.
 val releaseKeyStorePath = providers.environmentVariable("EKMIVO_ANDROID_KEYSTORE_FILE").orNull
 signingConfigs {
  create("ekmivoProduction") {
   if (releaseKeyStorePath != null) storeFile = file(releaseKeyStorePath)
   storePassword = providers.environmentVariable("EKMIVO_ANDROID_KEYSTORE_PASSWORD").orNull
   keyAlias = "ekmivo-production"
   keyPassword = providers.environmentVariable("EKMIVO_ANDROID_KEYSTORE_PASSWORD").orNull
   storeType = "pkcs12"
  }
 }
 buildTypes {
  release {
   if (releaseKeyStorePath != null) {
    signingConfig = signingConfigs.getByName("ekmivoProduction")
   }
   isMinifyEnabled = true
   isShrinkResources = true
   proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
  }
 }
 buildFeatures {
  compose = true
  buildConfig = true
 }
 compileOptions {
  sourceCompatibility = JavaVersion.VERSION_17
  targetCompatibility = JavaVersion.VERSION_17
 }
 kotlinOptions { jvmTarget = "17" }
}

val fontNames = mapOf(
 "HindSiliguri-Regular.ttf" to "hind_siliguri_regular.ttf",
 "HindSiliguri-Medium.ttf" to "hind_siliguri_medium.ttf",
 "HindSiliguri-SemiBold.ttf" to "hind_siliguri_semibold.ttf",
 "HindSiliguri-Bold.ttf" to "hind_siliguri_bold.ttf",
)
val stageHindSiliguri by tasks.registering(Copy::class) {
 from(file("../../web/src/fonts"))
 include(*fontNames.keys.toTypedArray())
 rename { original -> fontNames[original] ?: original }
 into(layout.buildDirectory.dir("generated/native-fonts/res/font"))
 includeEmptyDirs = false
}
android.sourceSets.getByName("main").res.srcDir(layout.buildDirectory.dir("generated/native-fonts/res"))
tasks.matching { task ->
 (task.name.startsWith("merge") || task.name.startsWith("generate")) && task.name.endsWith("Resources") ||
 task.name.startsWith("map") && task.name.endsWith("SourceSetPaths")
}.configureEach {
 dependsOn(stageHindSiliguri)
}

dependencies {
 implementation("androidx.work:work-runtime-ktx:2.10.0")
 implementation("androidx.room:room-runtime:2.6.1")
 implementation("androidx.room:room-ktx:2.6.1")
 kapt("androidx.room:room-compiler:2.6.1")
 implementation(platform("androidx.compose:compose-bom:2024.12.01"))
 implementation("androidx.compose.ui:ui")
 implementation("androidx.compose.ui:ui-tooling-preview")
 implementation("androidx.compose.foundation:foundation")
 implementation("androidx.compose.material3:material3")
 implementation("androidx.compose.material:material-icons-extended")
 implementation("androidx.core:core-ktx:1.15.0")
 implementation("androidx.activity:activity-compose:1.9.3")
 implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
 implementation("androidx.datastore:datastore-preferences:1.1.1")
 implementation("com.squareup.okhttp3:okhttp:4.12.0")
 implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
 implementation("androidx.camera:camera-core:1.4.1")
 implementation("androidx.camera:camera-camera2:1.4.1")
 implementation("androidx.camera:camera-lifecycle:1.4.1")
 implementation("androidx.camera:camera-view:1.4.1")
 implementation("com.google.mlkit:barcode-scanning:17.3.0")
 // Disabled Inbox groundwork: Firebase project config is not shipped.
 implementation("com.google.firebase:firebase-messaging:24.1.1")
 debugImplementation("androidx.compose.ui:ui-tooling")
 debugImplementation("androidx.compose.ui:ui-test-manifest")
 androidTestImplementation(platform("androidx.compose:compose-bom:2024.12.01"))
 androidTestImplementation("androidx.compose.ui:ui-test-junit4")
 androidTestImplementation("androidx.test.ext:junit:1.2.1")
 testImplementation("junit:junit:4.13.2")
}
