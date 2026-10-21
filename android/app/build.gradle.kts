import java.util.Properties

plugins {
    // AGP 9 compiles Kotlin sources itself (built-in Kotlin) — no separate Kotlin plugin needed.
    id("com.android.application")
}

/* ------------------------------------------------------------------ */
/* Bundled web UI                                                     */
/* ------------------------------------------------------------------ */

/**
 * Copies the built DeJournal web UI (dist/) into a generated assets folder
 * under `www/`. Run `npm run build` in the web project first.
 */
abstract class SyncWebAssets : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val webDist: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @TaskAction
    fun sync() {
        val dist = webDist.get().asFile
        if (!dist.resolve("index.html").isFile) {
            throw GradleException("No index.html in $dist. Run `npm run build` in the DeJournal web project first.")
        }
        fs.sync {
            from(dist) {
                // Service worker and web-only deploy files aren't used inside the app.
                exclude("sw.js", "_redirects")
            }
            into(outputDir.dir("www"))
        }
    }
}

val webDistPath = providers.gradleProperty("dejournal.webDist").orElse("../../dist")

val syncWebAssets = tasks.register<SyncWebAssets>("syncWebAssets") {
    // file() keeps absolute paths (e.g. on another drive) and resolves relative ones from app/.
    webDist.fileProvider(webDistPath.map { file(it) })
    outputDir.set(layout.buildDirectory.dir("generated/webassets"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(syncWebAssets, SyncWebAssets::outputDir)
    }
}

/* ------------------------------------------------------------------ */
/* Release signing (keystore.properties is never committed)           */
/* ------------------------------------------------------------------ */

val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.isFile) f.inputStream().use { load(it) }
}

android {
    namespace = "io.dejournal.app"
    compileSdk = 37

    defaultConfig {
        // The Play Store package name. It can't be changed after the first upload.
        applicationId = "io.dejournal.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.webkit:webkit:1.18.0")
}
