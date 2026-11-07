package com.briofold.mobile.ui

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
    val p = LocalBriofoldPalette.current
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(38.dp).background(colour, RoundedCornerShape(9.dp))
                .border(1.dp, p.border, RoundedCornerShape(9.dp))
        )
        Text(name, style = BriofoldType.meta, color = p.secondary)
    }
}

@Composable
private fun TokenPreview(dark: Boolean) {
    BriofoldTheme(dark) {
        val p = LocalBriofoldPalette.current
        Column(
            Modifier.fillMaxSize().background(p.canvas).verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("Briofold · Design tokens", style = BriofoldType.settingsTitle, color = p.text)
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
            Text("ফোন যুক্ত করুন", style = BriofoldType.centerTitle, color = p.text)
            Text(
                "এই ফোনে আসা পেমেন্টের SMS নিজে থেকে Briofold-তে পাঠানো হবে।",
                style = BriofoldType.body,
                color = p.secondary
            )
            Text("৳—", style = BriofoldType.heroAmount, color = p.text)
            Text("Secondary text · বাংলা ও English", style = BriofoldType.heroNote, color = p.secondary)

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BriofoldStatusTag("চালু", p.successBackground, p.success)
                BriofoldStatusTag("অপেক্ষায়", p.warningBackground, p.warning)
                BriofoldStatusTag("ব্যর্থ", p.dangerBackground, p.danger)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                BriofoldPill("বাংলা", selected = true, onClick = {})
                BriofoldPill("English", selected = false, onClick = {})
                BriofoldPill("ডার্ক", selected = dark, onClick = {})
            }
            BriofoldPrimaryButton("QR স্ক্যান করুন", onClick = {})

            Row(
                Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                BriofoldPulseRing(reducedMotion = true) {
                    Box(
                        Modifier.size(BriofoldTokens.Measure.heroCore)
                            .background(p.surface, CircleShape)
                            .border(1.dp, p.border, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("—", style = BriofoldType.heroAmount, color = p.text)
                    }
                }
                BriofoldScannerFrame()
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                BriofoldNavItem(label = "লাইভ", selected = true, onClick = {}, icon = {
                    BriofoldReferenceIcon(BriofoldGlyph.ACT)
                })
                BriofoldNavItem(label = "সেটিংস", selected = false, onClick = {}, icon = {
                    BriofoldReferenceIcon(BriofoldGlyph.SET, tint=p.secondary)
                })
            }
            // Each size/weight/line-height role from design spec section 2.
            val scale = listOf(
                "Shop 14/500" to BriofoldType.shop,
                "Meta 11/400" to BriofoldType.meta,
                "Hero 22/500" to BriofoldType.heroAmount,
                "Hero note 12" to BriofoldType.heroNote,
                "Stat 17/500" to BriofoldType.statNumber,
                "Section 11" to BriofoldType.section,
                "Row 14/500" to BriofoldType.rowAmount,
                "Tag 11" to BriofoldType.tag,
                "Nav 11" to BriofoldType.nav,
                "Button 15/500" to BriofoldType.button,
                "Link 13" to BriofoldType.link,
                "Center 19/500" to BriofoldType.centerTitle,
                "Body 13" to BriofoldType.body,
                "Settings row 13" to BriofoldType.settingsRow,
                "Segment 12" to BriofoldType.segment,
                "Settings title 17" to BriofoldType.settingsTitle
            )
            scale.forEach { (role, font) ->
                Row(
                    Modifier.fillMaxWidth().topHairline(p.border).padding(top = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(role, style = BriofoldType.meta, color = p.secondary)
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
