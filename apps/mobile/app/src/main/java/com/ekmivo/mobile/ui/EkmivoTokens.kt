package com.ekmivo.mobile.ui

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Native reference palette from the owner's 2026-10-19 HTML.
 * Android tokens are deliberately independent of dashboard CSS.
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
    val dangerBackground: Color,
    val seen: Color = Color(0xFF1E90E0)
)

object EkmivoTokens {
    val Light = EkmivoPalette(
        canvas = Color(0xFFF4F3EE),
        surface = Color(0xFFFFFFFF),
        raised = Color(0xFFECEAE2),
        subtle = Color(0xFFECEAE2),
        border = Color(0xFFD9D8D1),
        controlBorder = Color(0xFFD9D8D1),
        text = Color(0xFF1B1B19),
        secondary = Color(0xFF6B6A64),
        muted = Color(0xFF6B6A64),
        onPrimary = Color.White,
        success = Color(0xFF14935C),
        successBackground = Color(0xFFDDF3E8),
        warning = Color(0xFFB7791F),
        warningBackground = Color(0xFFFBEFD3),
        danger = Color(0xFFD6453A),
        dangerBackground = Color(0xFFF9DEDA)
    )

    val Dark = EkmivoPalette(
        canvas = Color(0xFF0F0F0E),
        surface = Color(0xFF181817),
        raised = Color(0xFF222220),
        subtle = Color(0xFF222220),
        border = Color(0xFF2C2C29),
        controlBorder = Color(0xFF2C2C29),
        text = Color(0xFFF1F0EA),
        secondary = Color(0xFF8D8B84),
        muted = Color(0xFF8D8B84),
        onPrimary = Color(0xFF111111),
        success = Color(0xFF3DDC97),
        successBackground = Color(0xFF12301F),
        warning = Color(0xFFF5B544),
        warningBackground = Color(0xFF33260D),
        danger = Color(0xFFF2685B),
        dangerBackground = Color(0xFF3A1B18)
    )

    // Screenshot reference palette for the native app; kept semantic across themes.
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
        val inputHeight = 40.dp
        val avatar = 40.dp
        val iconButton = 34.dp
        val icon = 20.dp
        val profileAvatar = 76.dp
        val sheetRadius = 24.dp
        val cardRadius = 18.dp
        val bubbleRadius = 16.dp
        val bubbleTail = 5.dp
    }
}

val LocalEkmivoPalette = staticCompositionLocalOf { EkmivoTokens.Light }
