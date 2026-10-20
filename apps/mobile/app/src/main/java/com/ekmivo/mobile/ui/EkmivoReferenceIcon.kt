package com.ekmivo.mobile.ui

import androidx.annotation.DrawableRes
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ekmivo.mobile.R

/** Owner HTML SVG sprite, ported as paths rather than look-alike Material icons. */
enum class EkmivoGlyph(@DrawableRes val drawable: Int) {
    ACT(R.drawable.reference_act),
    SET(R.drawable.reference_set),
    BAT(R.drawable.reference_bat),
    OFF(R.drawable.reference_off),
    STO(R.drawable.reference_sto),
    REF(R.drawable.reference_ref),
    MSG(R.drawable.reference_msg),
    BEL(R.drawable.reference_bel),
    DOC(R.drawable.reference_doc),
    PHN(R.drawable.reference_phn),
    CAM(R.drawable.reference_cam),
    CHK(R.drawable.reference_chk),
    WA(R.drawable.reference_wa),
    IG(R.drawable.reference_ig),
    MS(R.drawable.reference_ms),
    ARR(R.drawable.reference_arr),
    SND(R.drawable.reference_snd),
    FLT(R.drawable.reference_flt),
    ALT(R.drawable.reference_alt),
    BOT(R.drawable.reference_bot),
    WAL(R.drawable.reference_wal),
    BACK(R.drawable.reference_back),
    CLIP(R.drawable.reference_clip),
    MIC(R.drawable.reference_mic),
    X(R.drawable.reference_x),
    REP(R.drawable.reference_rep),
    FWD(R.drawable.reference_fwd),
    COPY(R.drawable.reference_copy),
    INFO(R.drawable.reference_info),
    PLAY(R.drawable.reference_play),
    PAUSE(R.drawable.reference_pause),
    IMG(R.drawable.reference_img),
    BAG(R.drawable.reference_bag),
    CLK(R.drawable.reference_clk),
    TRASH(R.drawable.reference_trash),
    DOWN(R.drawable.reference_down),
    LOCK_OPEN(R.drawable.reference_lock_open),
    LOCK(R.drawable.reference_lock),
    CHEVRON_UP(R.drawable.reference_chevron_up)
}

@Composable
fun EkmivoReferenceIcon(
    glyph: EkmivoGlyph,
    modifier: Modifier = Modifier,
    tint: Color = LocalEkmivoPalette.current.text,
    size: Dp = 20.dp,
    description: String? = null
) {
    if (glyph == EkmivoGlyph.CLIP) {
        // Use the maintained Material icon instead of the malformed legacy clip vector.
        Icon(Icons.Outlined.AttachFile,contentDescription=description,
            modifier=modifier.size(size),tint=tint)
    } else {
        Icon(painterResource(glyph.drawable),contentDescription=description,
            modifier=modifier.size(size),tint=tint)
    }
}
