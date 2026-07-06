import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Load local.properties (gitignored) for machine-local secrets like QUIZ_AES_KEY.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.examio.app"
    compileSdk = libs.versions.android.compile.sdk.get().toInt()

    defaultConfig {
        applicationId = "com.examio.app"
        minSdk = libs.versions.android.min.sdk.get().toInt()
        targetSdk = libs.versions.android.target.sdk.get().toInt()
        versionCode = 1
        versionName = "0.1.0"
        // API base URL. Overridable per build (CI/release MUST inject an HTTPS prod URL via
        // local.properties `apiBaseUrl=...` or `-PapiBaseUrl=...`); the dev default below is
        // only for local emulator debug builds (cleartext to host loopback).
        val apiBaseUrl = localProps.getProperty("apiBaseUrl")
            ?: (project.findProperty("apiBaseUrl") as String?)
            ?: "http://10.0.2.2:3000"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        // Secure-quiz AES key — must match BE/FE QUIZ_AES_KEY. Read from local.properties
        // (quizAesKey=...) or -PquizAesKey gradle property; never committed to source.
        val quizAesKey = localProps.getProperty("quizAesKey")
            ?: (project.findProperty("quizAesKey") as String?)
            ?: ""
        buildConfigField("String", "QUIZ_AES_KEY", "\"$quizAesKey\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            // Shrink + obfuscate release code (raises the bar on reverse-engineering the
            // embedded quiz key / logic). Keep-rules in proguard-rules.pro protect
            // kotlinx.serialization + Ktor. Resource shrinking left off to avoid stripping
            // Compose/theme resources. NOTE: requires an on-device release smoke test.
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
