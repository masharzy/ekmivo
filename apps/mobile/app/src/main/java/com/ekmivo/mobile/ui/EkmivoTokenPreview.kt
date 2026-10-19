package com.ekmivo.mobile.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Phase 1 only: a developer preview of owner-reference tokens and reference
 * primitives. It is not routed into the shipping Android UI.
 */
@Composable
private fun ColourSample(name: String, colour: Color) {
    val p = LocalEkmivoPalette.current
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(38.dp).background(colour, RoundedCornerShape(9.dp))
                .border(1.dp, p.border, RoundedCornerShape(9.dp))
        )
        Text(name, style = EkmivoType.meta, color = p.secondary)
    }
}

@Composable
private fun TokenPreview(dark: Boolean) {
    EkmivoTheme(dark) {
        val p = LocalEkmivoPalette.current
        Column(
            Modifier.fillMaxSize().background(p.canvas).verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("Ekmivo · Design tokens", style = EkmivoType.settingsTitle, color = p.text)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                ColourSample("Canvas", p.canvas)
                ColourSample("Surface", p.surface)
                ColourSample("Raised", p.raised)
                ColourSample("Text", p.text)
                ColourSample("Border", p.border)
                ColourSample("Subtle", p.subtle)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                ColourSample("Success", p.success)
                ColourSample("Warning", p.warning)
                ColourSample("Danger", p.danger)
            }
            Text("ফোন যুক্ত করুন", style = EkmivoType.centerTitle, color = p.text)
            Text(
                "এই ফোনে আসা পেমেন্টের SMS নিজে থেকে Ekmivo-তে পাঠানো হবে।",
                style = EkmivoType.body,
                color = p.secondary
            )
            Text("৳—", style = EkmivoType.heroAmount, color = p.text)
            Text("Secondary text · বাংলা ও English", style = EkmivoType.heroNote, color = p.secondary)

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                EkmivoStatusTag("চালু", p.successBackground, p.success)
                EkmivoStatusTag("অপেক্ষায়", p.warningBackground, p.warning)
                EkmivoStatusTag("ব্যর্থ", p.dangerBackground, p.danger)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                EkmivoPill("বাংলা", selected = true, onClick = {})
                EkmivoPill("English", selected = false, onClick = {})
                EkmivoPill("ডার্ক", selected = dark, onClick = {})
            }
            EkmivoPrimaryButton("QR স্ক্যান করুন", onClick = {})

            Row(
                Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                EkmivoPulseRing(reducedMotion = true) {
                    Box(
                        Modifier.size(EkmivoTokens.Measure.heroCore)
                            .background(p.surface, CircleShape)
                            .border(1.dp, p.border, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("—", style = EkmivoType.heroAmount, color = p.text)
                    }
                }
                EkmivoScannerFrame()
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                EkmivoNavItem(label = "লাইভ", selected = true, onClick = {}, icon = {
                    EkmivoReferenceIcon(EkmivoGlyph.ACT)
                })
                EkmivoNavItem(label = "সেটিংস", selected = false, onClick = {}, icon = {
                    EkmivoReferenceIcon(EkmivoGlyph.SET, tint=p.secondary)
                })
            }
            // Each size/weight/line-height role from design spec section 2.
            val scale = listOf(
                "Shop 14/500" to EkmivoType.shop,
                "Meta 11/400" to EkmivoType.meta,
                "Hero 22/500" to EkmivoType.heroAmount,
                "Hero note 12" to EkmivoType.heroNote,
                "Stat 17/500" to EkmivoType.statNumber,
                "Section 11" to EkmivoType.section,
                "Row 14/500" to EkmivoType.rowAmount,
                "Tag 11" to EkmivoType.tag,
                "Nav 11" to EkmivoType.nav,
                "Button 15/500" to EkmivoType.button,
                "Link 13" to EkmivoType.link,
                "Center 19/500" to EkmivoType.centerTitle,
                "Body 13" to EkmivoType.body,
                "Settings row 13" to EkmivoType.settingsRow,
                "Segment 12" to EkmivoType.segment,
                "Settings title 17" to EkmivoType.settingsTitle
            )
            scale.forEach { (role, font) ->
                Row(
                    Modifier.fillMaxWidth().topHairline(p.border).padding(top = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(role, style = EkmivoType.meta, color = p.secondary)
                    Text("বাংলা English", style = font, color = p.text)
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Preview(name = "Phase 1 · BN Dark 360", widthDp = 360, heightDp = 850, locale = "bn")
@Composable
private fun PreviewDark360() = TokenPreview(dark = true)

@Preview(name = "Phase 1 · BN Light 412", widthDp = 412, heightDp = 850, locale = "bn")
@Composable
private fun PreviewLight412() = TokenPreview(dark = false)
