package com.ekmivo.mobile.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.StartOffsetType
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.dp

/** Pure custom components for the design preview and later screen phases. */
fun Modifier.topHairline(color: Color) = this.drawBehind {
    drawLine(color, Offset(0f, 0f), Offset(size.width, 0f), strokeWidth = 1.dp.toPx())
}
@Composable
fun EkmivoPrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalEkmivoPalette.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier.fillMaxWidth()
            .height(EkmivoTokens.Measure.primaryButtonHeight)
            .graphicsLayer { alpha = if (pressed) .88f else 1f }
            .clip(RoundedCornerShape(14.dp))
            .background(palette.text)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(label, style = EkmivoType.button, color = palette.onPrimary)
    }
}

@Composable
fun EkmivoPill(label: String, selected: Boolean, onClick: () -> Unit) {
    val palette = LocalEkmivoPalette.current
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) palette.text else Color.Transparent)
            .border(1.dp, if (selected) palette.text else palette.border, CircleShape)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(label, style = EkmivoType.segment, color = if (selected) palette.onPrimary else palette.secondary)
    }
}

@Composable
fun EkmivoStatusTag(label: String, background: Color, foreground: Color) {
    Box(Modifier.clip(CircleShape).background(background).padding(horizontal = 8.dp, vertical = 3.dp)) {
        Text(label, style = EkmivoType.tag, color = foreground)
    }
}

@Composable
fun EkmivoNavItem(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    icon: @Composable () -> Unit
) {
    val palette = LocalEkmivoPalette.current
    val color = if (selected) palette.text else palette.secondary
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) palette.subtle else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        icon()
        Text(label, color = color, style = EkmivoType.nav)
    }
}

@Composable
fun EkmivoScannerFrame(modifier: Modifier = Modifier) {
    val ink = LocalEkmivoPalette.current.text
    Canvas(modifier.size(EkmivoTokens.Measure.scannerFrame)) {
        val side = size.width
        val length = 26.dp.toPx()
        val radius = 10.dp.toPx()
        val stroke = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round)
        drawPath(Path().apply {
            moveTo(0f, length)
            lineTo(0f, radius)
            arcTo(Rect(0f, 0f, 2 * radius, 2 * radius), 180f, 90f, false)
            lineTo(length, 0f)
        }, color = ink, style = stroke)
        drawPath(Path().apply {
            moveTo(side - length, 0f)
            lineTo(side - radius, 0f)
            arcTo(Rect(side - 2 * radius, 0f, side, 2 * radius), 270f, 90f, false)
            lineTo(side, length)
        }, color = ink, style = stroke)
        drawPath(Path().apply {
            moveTo(side, side - length)
            lineTo(side, side - radius)
            arcTo(Rect(side - 2 * radius, side - 2 * radius, side, side), 0f, 90f, false)
            lineTo(side - length, side)
        }, color = ink, style = stroke)
        drawPath(Path().apply {
            moveTo(length, side)
            lineTo(radius, side)
            arcTo(Rect(0f, side - 2 * radius, 2 * radius, side), 90f, 90f, false)
            lineTo(0f, side - length)
        }, color = ink, style = stroke)
    }
}

/** Preview/reduced-motion rings are static; no transition is started. */
@Composable
fun EkmivoPulseRing(
    modifier: Modifier = Modifier,
    reducedMotion: Boolean = false,
    core: @Composable () -> Unit
) {
    val palette = LocalEkmivoPalette.current
    val static = reducedMotion || LocalInspectionMode.current
    Box(modifier.size(EkmivoTokens.Measure.heroRing), contentAlignment = Alignment.Center) {
        if (static) {
            Box(
                Modifier.fillMaxSize()
                    .graphicsLayer { alpha = .18f }
                    .border(1.dp, palette.success, CircleShape)
            )
        } else {
            val transition = rememberInfiniteTransition(label = "live pulse")
            @Composable
            fun Ring(offset: Int) {
                val progress by transition.animateFloat(
                    initialValue = 0f, targetValue = 1f,
                    animationSpec = infiniteRepeatable(
                        tween(2800, easing = CubicBezierEasing(.25f, .1f, .25f, 1f)),
                        RepeatMode.Restart,
                        initialStartOffset = StartOffset(offset, StartOffsetType.FastForward)
                    ),
                    label = "pulse $offset"
                )
                Box(
                    Modifier.fillMaxSize()
                        .graphicsLayer {
                            val scale = .8f + .45f * progress
                            scaleX = scale
                            scaleY = scale
                            alpha = .5f * (1f - progress)
                        }
                        .border(1.dp, palette.success, CircleShape)
                )
            }
            Ring(0)
            Ring(1400)
        }
        core()
    }
}
