package com.examio.app.design

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// Token values mirror examio-fe/src/app/globals.css :root (light mode) exactly.
// Material ColorScheme covers the standard slots; ExamioTokens carries the rest.
private val Canvas = Color(0xFFFAF9F7)
private val SurfaceSoft = Color(0xFFF2F0EC)
private val SurfaceCard = Color(0xFFE8E5E0)
private val SurfaceCreamStrong = Color(0xFFDDD9D0)
private val Hairline = Color(0xFFD8D4CC)
private val HairlineSoft = Color(0xFFE0DCD4)
private val Coral = Color(0xFFC2522D)
private val CoralActive = Color(0xFFA54524)
private val AccentTeal = Color(0xFF5DB8A6)
private val AccentAmber = Color(0xFFE8A55A)
private val Ink = Color(0xFF1A1A18)
private val BodyStrong = Color(0xFF2D2D2A)
private val MutedText = Color(0xFF6B6B63)
private val OnPrimary = Color(0xFFFFFFFF)
private val Success = Color(0xFF5DB872)
private val Warning = Color(0xFFD4A017)
private val ErrorRed = Color(0xFFC64545)

private val ExamioLightColors: ColorScheme = lightColorScheme(
    primary = Coral,
    onPrimary = OnPrimary,
    primaryContainer = SurfaceCreamStrong,
    onPrimaryContainer = Ink,
    secondary = BodyStrong,
    onSecondary = OnPrimary,
    background = Canvas,
    onBackground = Ink,
    surface = SurfaceCard,
    onSurface = Ink,
    surfaceVariant = SurfaceSoft,
    onSurfaceVariant = MutedText,
    outline = Hairline,
    outlineVariant = HairlineSoft,
    error = ErrorRed,
    onError = OnPrimary,
)

/** Non-Material semantic tokens from globals.css that ColorScheme can't hold. */
data class ExamioTokens(
    val canvas: Color = Canvas,
    val surfaceSoft: Color = SurfaceSoft,
    val surfaceCard: Color = SurfaceCard,
    val surfaceCreamStrong: Color = SurfaceCreamStrong,
    val hairline: Color = Hairline,
    val hairlineSoft: Color = HairlineSoft,
    val coral: Color = Coral,
    val coralActive: Color = CoralActive,
    val accentTeal: Color = AccentTeal,
    val accentAmber: Color = AccentAmber,
    val ink: Color = Ink,
    val bodyStrong: Color = BodyStrong,
    val mutedText: Color = MutedText,
    val success: Color = Success,
    val warning: Color = Warning,
)

private val LocalExamioTokens = staticCompositionLocalOf { ExamioTokens() }

/** Canonical card corner radius (globals.css --radius: 0.75rem). */
val ExamioCardShape = RoundedCornerShape(12.dp)

object ExamioTheme {
    val tokens: ExamioTokens
        @Composable
        @ReadOnlyComposable
        get() = LocalExamioTokens.current
}

/** The FE card edge: 1px hairline border on every card/surface. */
@Composable
@ReadOnlyComposable
fun examioCardBorder(): BorderStroke = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)

// Intentionally light-only: examio-fe mobile-web ships a light surface by default and this
// round matches that. The light scheme is applied unconditionally so a device set to dark
// mode does NOT get a light-on-dark mismatch on Material chrome — every screen renders the
// same light palette. TODO(dark-mode): wire darkColorScheme from globals.css .dark tokens
// and branch on isSystemInDarkTheme() when dark mode enters scope.
@Composable
fun ExamioTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalExamioTokens provides ExamioTokens()) {
        MaterialTheme(
            colorScheme = ExamioLightColors,
            content = content,
        )
    }
}
