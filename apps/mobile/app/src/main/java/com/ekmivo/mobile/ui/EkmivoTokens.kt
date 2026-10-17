package com.ekmivo.mobile.ui

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Phase 0: semantic Android tokens copied from docs/design/tokens.css.
 * Canvas/surface/text are the --dashboard-* values. Status colours are
 * --color-success/warning/danger and their matching background roles.
 * These are NOT the reference HTML's placeholder colours.
 */
@Immutable
data class EkmivoPalette(
    val canvas: Color,
    val surface: Color,
    val raised: Color,
    val subtle: Color,
    val border: Color,
    val controlBorder: Color,
    val text: Color,
    val secondary: Color,
    val muted: Color,
    val onPrimary: Color,
    val success: Color,
    val successBackground: Color,
    val warning: Color,
    val warningBackground: Color,
    val danger: Color,
    val dangerBackground: Color
)

object EkmivoTokens {
    val Light = EkmivoPalette(
        canvas = Color(0xFFF5F5F1),
        surface = Color(0xFFFFFEFB),
        raised = Color(0xFFFFFFFF),
        subtle = Color(0xFFEEEFEA),
        border = Color(0xFFE2E5DE),
        controlBorder = Color(0xFFA6ADA7),
        text = Color(0xFF203148),
        secondary = Color(0xFF5C6874),
        muted = Color(0xFF677183),
        onPrimary = Color.White,
        success = Color(0xFF285D42),
        successBackground = Color(0xFFE2F1E7),
        warning = Color(0xFF77511D),
        warningBackground = Color(0xFFFBF0DB),
        danger = Color(0xFF9C3134),
        dangerBackground = Color(0xFFFBE9E8)
    )

    val Dark = EkmivoPalette(
        canvas = Color(0xFF181C20),
        surface = Color(0xFF20262B),
        raised = Color(0xFF293138),
        subtle = Color(0xFF252C31),
        border = Color(0xFF333D44),
        controlBorder = Color(0xFF65727D),
        text = Color(0xFFE6EAE7),
        secondary = Color(0xFFACB7BF),
        muted = Color(0xFFA9A9A9),
        onPrimary = Color.Black,
        success = Color(0xFFB2DEC1),
        successBackground = Color(0xFF243A2D),
        warning = Color(0xFFF0D092),
        warningBackground = Color(0xFF44351F),
        danger = Color(0xFFF5B4AE),
        dangerBackground = Color(0xFF462827)
    )

    // Exact fixed-size reference geometry. Semantic panel/control/dialog radii
    // are in EkmivoTheme; components retain the reference's own geometry.
    object Measure {
        val screenPadding = 16.dp
        val logo = 34.dp
        val providerMark = 30.dp
        val heroRing = 136.dp
        val heroCore = 112.dp
        val iconTile = 76.dp
        val scannerFrame = 150.dp
        val primaryButtonHeight = 46.dp
        val hairline = 1.dp
    }
}

val LocalEkmivoPalette = staticCompositionLocalOf { EkmivoTokens.Light }
