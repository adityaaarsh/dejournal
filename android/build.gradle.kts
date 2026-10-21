plugins {
    id("com.android.application") version "9.4.1" apply false
}

// Optional: put build output somewhere else (e.g. a drive with more space).
// Set `dejournal.buildRoot=D:/DeJournal-build` in ~/.gradle/gradle.properties.
providers.gradleProperty("dejournal.buildRoot").orNull?.let { root ->
    allprojects {
        layout.buildDirectory.set(file("$root/${if (path == ":") "root" else path.removePrefix(":").replace(':', '-')}"))
    }
}
