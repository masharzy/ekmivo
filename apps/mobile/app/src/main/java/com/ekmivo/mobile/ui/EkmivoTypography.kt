package com.ekmivo.mobile.ui

import androidx.compose.material3.Typography
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ekmivo.mobile.R

// Bundled at build time from the existing web font files; no new font assets.
private val HindSiliguri = FontFamily(
    Font(R.font.hind_siliguri_regular, FontWeight.Normal),
    Font(R.font.hind_siliguri_medium, FontWeight.Medium)
)

private fun type(size: Int, height: Int, medium: Boolean = false) = TextStyle(
    fontFamily = HindSiliguri,
    fontWeight = if (medium) FontWeight.Medium else FontWeight.Normal,
    fontSize = size.sp,
    lineHeight = height.sp,
    platformStyle = PlatformTextStyle(includeFontPadding = false)
)

// Exact roles from ekmivo-android-design-spec.md §2. No 600/700 weights.
object EkmivoType {
    val shop = type(14, 18, true)
    val meta = type(11, 16)
    val heroAmount = type(22, 27, true)
    val heroNote = type(12, 18)
    val statNumber = type(17, 21, true)
    val section = type(11, 16)
    val rowAmount = type(14, 18, true)
    val tag = type(11, 15)
    val nav = type(11, 15)
    val button = type(15, 21, true)
    val link = type(13, 19)
    val centerTitle = type(19, 29, true)
    val body = type(13, 22)
    val settingsRow = type(13, 19)
    val segment = type(12, 17)
    val settingsTitle = type(17, 22, true)
}

val EkmivoMaterialTypography = Typography(
    displayLarge = type(33, 44, true),
    displayMedium = type(27, 37, true),
    displaySmall = type(22, 32, true),
    headlineLarge = type(22, 32, true),
    headlineMedium = EkmivoType.centerTitle,
    headlineSmall = EkmivoType.settingsTitle,
    titleLarge = EkmivoType.settingsTitle,
    titleMedium = EkmivoType.shop,
    titleSmall = EkmivoType.shop,
    bodyLarge = type(16, 27),
    bodyMedium = EkmivoType.body,
    bodySmall = EkmivoType.heroNote,
    labelLarge = EkmivoType.button,
    labelMedium = EkmivoType.meta,
    labelSmall = EkmivoType.tag
)
