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

private fun type(size: Int, height: Number, medium: Boolean = false) = TextStyle(
    fontFamily = HindSiliguri,
    fontWeight = if (medium) FontWeight.Medium else FontWeight.Normal,
    fontSize = size.sp,
    lineHeight = height.toFloat().sp,
    platformStyle = PlatformTextStyle(includeFontPadding = false)
)

// Exact roles from ekmivo-android-design-spec.md §2. No 600/700 weights.
object EkmivoType {
    val shop = type(14, 16.8f, true)
    val meta = type(11, 15.4f)
    val heroAmount = type(22, 26.4f, true)
    val heroNote = type(12, 18)
    val statNumber = type(17, 20.4f, true)
    val section = type(11, 15.4f)
    val rowAmount = type(14, 17.5f, true)
    val tag = type(11, 13.2f)
    val nav = type(11, 13.2f)
    val button = type(15, 18f, true)
    val link = type(13, 18.2f)
    val centerTitle = type(19, 28.5f, true)
    val body = type(13, 22.1f)
    val settingsRow = type(13, 18.2f)
    val segment = type(12, 14.4f)
    val settingsTitle = type(17, 20.4f, true)
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
