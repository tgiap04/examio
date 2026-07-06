# Examio release keep-rules.
# Generous keeps: the goal is obfuscating app logic, not aggressive shrinking. Keeping too
# much only costs APK size; keeping too little causes release-only runtime crashes.

-keepattributes *Annotation*, InnerClasses, Signature, EnclosingMethod

# ── kotlinx.serialization ────────────────────────────────────────────────────
# 1.7.3 ships consumer rules, but the @Serializable models live in the :shared module,
# so keep them and their generated $$serializer classes explicitly.
-keepclassmembers @kotlinx.serialization.Serializable class com.examio.app.** {
    *** Companion;
    <fields>;
}
-keepclasseswithmembers class com.examio.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.examio.app.**$$serializer { *; }
-keep class com.examio.app.**.models.** { *; }
-keep class com.examio.app.core.network.** { *; }
-keep class com.examio.app.core.session.** { *; }
-dontnote kotlinx.serialization.**

# ── Ktor + coroutines ────────────────────────────────────────────────────────
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**
-dontwarn kotlinx.coroutines.**
-dontwarn org.slf4j.**
