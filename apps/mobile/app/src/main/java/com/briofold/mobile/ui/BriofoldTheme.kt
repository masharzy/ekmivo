package com.briofold.mobile.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.unit.dp

private val BriofoldShapes = Shapes(
    small = RoundedCornerShape(12.dp),  // reference controls
    medium = RoundedCornerShape(18.dp), // reference profile card
    large = RoundedCornerShape(24.dp)  // reference sheet
)


private val Light = BriofoldTokens.Light.let { p ->
    lightColorScheme(
        primary = p.text, onPrimary = p.onPrimary,
        primaryContainer = p.subtle, onPrimaryContainer = p.text,
        inversePrimary = p.raised,
        secondary = p.secondary, onSecondary = p.raised,
        secondaryContainer = p.subtle, onSecondaryContainer = p.text,
        tertiary = p.text, onTertiary = p.onPrimary,
        tertiaryContainer = p.subtle, onTertiaryContainer = p.text,
        background = p.canvas, onBackground = p.text,
        surface = p.surface, onSurface = p.text,
        surfaceVariant = p.subtle, onSurfaceVariant = p.secondary,
        surfaceTint = p.surface,
        surfaceBright = p.raised,
        surfaceDim = p.subtle,
        surfaceContainerLowest = p.canvas,
        surfaceContainerLow = p.surface,
        surfaceContainer = p.surface,
        surfaceContainerHigh = p.raised,
        surfaceContainerHighest = p.subtle,
        inverseSurface = p.text, inverseOnSurface = p.raised,
        error = p.danger, onError = p.raised,
        errorContainer = p.dangerBackground, onErrorContainer = p.danger,
        outline = p.controlBorder, outlineVariant = p.border,
        scrim = androidx.compose.ui.graphics.Color.Black
    )
}

private val Dark = BriofoldTokens.Dark.let { p ->
    darkColorScheme(
        primary = p.text, onPrimary = p.onPrimary,
        primaryContainer = p.raised, onPrimaryContainer = p.text,
        inversePrimary = p.surface,
        secondary = p.secondary, onSecondary = p.canvas,
        secondaryContainer = p.subtle, onSecondaryContainer = p.text,
        tertiary = p.text, onTertiary = p.onPrimary,
        tertiaryContainer = p.subtle, onTertiaryContainer = p.text,
        background = p.canvas, onBackground = p.text,
        surface = p.surface, onSurface = p.text,
        surfaceVariant = p.subtle, onSurfaceVariant = p.secondary,
        surfaceTint = p.surface,
        surfaceBright = p.raised,
        surfaceDim = p.subtle,
        surfaceContainerLowest = p.canvas,
        surfaceContainerLow = p.surface,
        surfaceContainer = p.surface,
        surfaceContainerHigh = p.raised,
        surfaceContainerHighest = p.subtle,
        inverseSurface = p.text, inverseOnSurface = p.canvas,
        error = p.danger, onError = p.canvas,
        errorContainer = p.dangerBackground, onErrorContainer = p.danger,
        outline = p.controlBorder, outlineVariant = p.border,
        scrim = androidx.compose.ui.graphics.Color.Black
    )
}

@Composable
fun BriofoldTheme(dark: Boolean, content: @Composable () -> Unit) {
    val p = if (dark) BriofoldTokens.Dark else BriofoldTokens.Light
    CompositionLocalProvider(LocalBriofoldPalette provides p) {
        MaterialTheme(
            colorScheme = if (dark) Dark else Light,
            typography = BriofoldMaterialTypography,
            shapes = BriofoldShapes,
            content = content
        )
    }
}
