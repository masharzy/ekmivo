package com.ekmivo.mobile.receipt

import android.Manifest
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.ekmivo.mobile.R
import com.ekmivo.mobile.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

private enum class PairPage { WELCOME, CAMERA, SCAN, LOADING, FAILED, CONFIRM, CONNECTING, CODE }

/** Keeps the Ekmivo preference (BN/EN), not Android system language, authoritative. */
private class PairCopy(context: Context, bn: Boolean) {
 private val themed = context.createConfigurationContext(
  Configuration(context.resources.configuration).apply {
   setLocale(Locale.forLanguageTag(if (bn) "bn" else "en"))
  }
 )
 fun get(id: Int): String = themed.getString(id)
 fun format(id: Int, vararg arguments: Any): String = themed.getString(id, *arguments)
}

private fun pairFailure(status: Int, body: String): Int {
 val code = runCatching { JSONObject(body).optJSONObject("error")?.optString("code").orEmpty() }.getOrDefault("")
 return when {
  status == 410 || "EXPIRED" in code.uppercase() -> R.string.pair_error_expired
  status == 409 || "USED" in code.uppercase() || "CLAIMED" in code.uppercase() -> R.string.pair_error_used
  "ENVIRONMENT" in code.uppercase() || "REALM" in code.uppercase() -> R.string.pair_error_environment
  status >= 500 || status == 429 -> R.string.pair_error_network
  else -> R.string.pair_error_generic
 }
}

/** These screens do NOT replace Phase 3's permission wizard or Phase 4's Home. */
@Composable
fun PairingFlow(
 bn: Boolean,
 incomingLink: String?,
 onLanguageChange: (Boolean) -> Unit,
 onPaired: () -> Unit
) {
 val context = LocalContext.current
 val appContext = context.applicationContext
 val copy = remember(context, bn) { PairCopy(context, bn) }
 val p = LocalEkmivoPalette.current
 val scope = rememberCoroutineScope()
 var page by rememberSaveable { mutableStateOf(PairPage.WELCOME) }
 var token by rememberSaveable { mutableStateOf("") }
 var input by rememberSaveable { mutableStateOf("") }
 var errorId by remember { mutableIntStateOf(0) }
 var torch by rememberSaveable { mutableStateOf(false) }
 var claimPending by remember { mutableStateOf(false) }
 var previewJSON by rememberSaveable { mutableStateOf("") }
 val workspace = remember(previewJSON) { runCatching { JSONObject(previewJSON) }.getOrNull() }
 fun lookup(scanned: String) {
  token=scanned; input=scanned; previewJSON=""; errorId=0; torch=false; page=PairPage.LOADING
 }
 BackHandler(enabled=page!=PairPage.WELCOME && page!=PairPage.CONNECTING) {
  previewJSON=""; token=""; errorId=0; torch=false; page=PairPage.WELCOME
 }
 LaunchedEffect(page,token) {
  if(page!=PairPage.LOADING) return@LaunchedEffect
  try {
   val result=withContext(Dispatchers.IO) {
    ReceiptTransport.post(appContext,"pairing-preview","",UUID.randomUUID().toString(),
     JSONObject().put("pairing_token",token).toString().toByteArray(Charsets.UTF_8))
   }
   if(result.first!=200) { errorId=pairFailure(result.first,result.second);page=PairPage.FAILED }
   else {
    val loaded=JSONObject(result.second)
    require(loaded.optString("workspace_name").isNotBlank() && loaded.optString("workspace_id").isNotBlank())
    require(loaded.optString("environment") in listOf("sandbox","live"))
    val products=loaded.getJSONObject("products")
    require(products.optBoolean("payments") || products.optBoolean("ai"))
    previewJSON=result.second;page=PairPage.CONFIRM
   }
  } catch(e:CancellationException) { throw e }
    catch(_:Exception) { errorId=R.string.pair_error_network;page=PairPage.FAILED }
 }


 fun enterCode() { errorId = 0; page = PairPage.CODE }
 fun enterScanner() {
  errorId = 0
  page = if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
   == PackageManager.PERMISSION_GRANTED) PairPage.SCAN else PairPage.CAMERA
 }
 val askCamera = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
  if (granted) { errorId = 0; page = PairPage.SCAN }
  else errorId = R.string.pair_error_permission
 }
 LaunchedEffect(incomingLink) {
  if (!incomingLink.isNullOrBlank()) {
   val parsed = PairingToken.parse(incomingLink)
   if (parsed == null) {
    errorId = R.string.pair_error_format
    page = PairPage.CODE
   } else {
    lookup(parsed) // Lookup is read-only. Only the consent button claims.
   }
  }
 }
 val genericHeader = page != PairPage.WELCOME
 val headerSubtitle = if (page == PairPage.CODE) copy.get(R.string.pair_header_code)
  else copy.get(R.string.pair_header_scan)

 Column(
  Modifier.fillMaxSize().background(p.canvas).statusBarsPadding().navigationBarsPadding()
 ) {
  PairingHeader(
   title = if (genericHeader) copy.get(R.string.pair_header) else "Ekmivo",
   subtitle = if (genericHeader) headerSubtitle else null,
   bn = bn,
   onLanguageChange = onLanguageChange
  )
  when (page) {
   PairPage.WELCOME -> {
    PairingWelcome(
     copy, bn, onScan = { enterScanner() }, onCode = { enterCode() }
    )
   }
   PairPage.CAMERA -> {
    PairViewport {
     Column(
      Modifier.fillMaxWidth().padding(horizontal = 22.dp),
      horizontalAlignment = Alignment.CenterHorizontally
     ) {
      PairIconTile("camera")
      Spacer(Modifier.height(18.dp))
      PairTitle(copy.get(R.string.pair_camera_title))
      Spacer(Modifier.height(6.dp))
      PairBody(copy.get(R.string.pair_camera_body))
     }
    }
    PairingBottom(
     copy.get(R.string.pair_allow), { askCamera.launch(Manifest.permission.CAMERA) },
     copy.get(R.string.pair_code_link), { enterCode() }
    )
   }
   PairPage.SCAN -> {
    PairViewport {
     Box(Modifier.fillMaxSize()) {
      PairingCamera(
       torchRequested = torch,
       onToken = { scanned ->
        lookup(scanned)
       },
       onCameraError = { errorId = R.string.pair_error_camera }
      )
      Box(Modifier.align(Alignment.TopEnd).padding(12.dp)) {
       PairActionPill(copy.get(R.string.pair_torch), selected = torch) { torch = !torch }
      }
      Column(
       Modifier.align(Alignment.Center),
       horizontalAlignment = Alignment.CenterHorizontally,
       verticalArrangement = Arrangement.spacedBy(16.dp)
      ) {
       EkmivoScannerFrame()
       Text(copy.get(R.string.pair_scan_hint), style = EkmivoType.heroNote, color = p.secondary)
      }
     }
    }
    PairingBottom(null, null, copy.get(R.string.pair_code_link), { enterCode() })
   }
   PairPage.LOADING -> {
    Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal=24.dp),
     horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
     PairIconTile("spinner")
     Spacer(Modifier.height(18.dp))
     PairTitle(copy.get(R.string.pair_lookup_title))
     Spacer(Modifier.height(8.dp))
     PairBody(copy.get(R.string.pair_lookup_body))
    }
   }
   PairPage.FAILED -> {
    Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal=24.dp),
     horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
     EkmivoReferenceIcon(EkmivoGlyph.ALT, tint=p.danger, size=32.dp)
     Spacer(Modifier.height(18.dp))
     PairTitle(copy.get(R.string.pair_lookup_failed))
    }
    PairingBottom(copy.get(R.string.pair_lookup_retry),{lookup(token)},
     copy.get(R.string.pair_rescan),{enterScanner()})
   }
   PairPage.CONFIRM -> {
    PairViewport {
     Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
      // Camera is no longer analyzing after successful scan. Dim the frame only.
      Box(Modifier.graphicsLayer { alpha = .55f }) { EkmivoScannerFrame() }
     }
    }
    Column(
     Modifier.fillMaxWidth()
      .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
      .background(p.raised)
      .topHairline(p.border)
      .padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 22.dp)
    ) {
     Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(p.text),
       contentAlignment = Alignment.Center) {
       Text("e.", style = EkmivoType.shop, color = p.onPrimary)
      }
      Column {
       Text(workspace?.optString("workspace_name").orEmpty(), style = EkmivoType.shop, color = p.text)
       Text(copy.get(R.string.pair_workspace), style = EkmivoType.meta, color = p.secondary)
      }
     }
     Spacer(Modifier.height(10.dp))
     val products=workspace?.optJSONObject("products")
     Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.surface)) {
      listOf("ai" to "AI Bot", "payments" to "Payment").forEach { (key,label) ->
       if(products?.optBoolean(key)==true) Row(Modifier.fillMaxWidth().padding(horizontal=12.dp,vertical=9.dp),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        EkmivoReferenceIcon(if(key=="ai") EkmivoGlyph.BOT else EkmivoGlyph.WAL,size=17.dp,tint=p.secondary)
        Text(label,style=EkmivoType.settingsRow,color=p.text,modifier=Modifier.weight(1f))
        EkmivoStatusTag(copy.get(R.string.pair_service_enabled),p.successBackground,p.success)
       }
      }
     }
     Spacer(Modifier.height(10.dp))
     Text(copy.get(if(products?.optBoolean("payments")==true) R.string.pair_payment_notice else R.string.pair_ai_notice),
      style=EkmivoType.body,color=p.secondary)
     Spacer(Modifier.height(14.dp))
     EkmivoPrimaryButton(copy.get(R.string.pair_connect), onClick = {
      if (!claimPending) {
       claimPending = true
       page = PairPage.CONNECTING
       errorId = 0
       val consentAt = System.currentTimeMillis()
       scope.launch {
        try {
         val actualToken = PairingToken.parse(token) ?: error("INVALID_PAIR_TOKEN")
         val result = withContext(Dispatchers.IO) {
          val key = AndroidKeystoreSigner("ekmivo-receipt-device").ensurePublicKey()
          val payload = JSONObject().put("pairing_token", actualToken)
           .put("public_key", Base64.encodeToString(key, Base64.NO_WRAP))
           .toString().toByteArray(Charsets.UTF_8)
          ReceiptTransport.post(appContext, "claim", "", UUID.randomUUID().toString(), payload)
         }
         if (result.first != 200) {
          errorId = pairFailure(result.first, result.second)
          page = PairPage.CONFIRM
         } else {
          val claim = JSONObject(result.second)
          require(claim.optString("id").isNotBlank() && claim.optString("environment").isNotBlank()) {
           "INVALID_CLAIM"
          }
          require(claim.optString("workspace_id")==workspace?.optString("workspace_id") &&
           claim.optString("environment")==workspace?.optString("environment")) { "PAIRING_SCOPE_CHANGED" }
          withContext(Dispatchers.IO) {
           ReceiptStore(appContext).use { store ->
            store.savePendingEnrollment(claim)
            store.saveEnrollment(claim)
           }
           // Record only the explicit button consent, never code entry or scanning.
           val saved = appContext.getSharedPreferences("receipt-enrollment", Context.MODE_PRIVATE)
            .edit().putLong("pairing_consent_at", consentAt)
            .putInt("pairing_consent_version", 1).commit()
           check(saved)
          }
          ReceiptRepository.get(appContext).pairedAwaitingCheck()
          ReceiptSyncWorker.scheduleNow(appContext)
          token = ""
          input = ""
          onPaired()
         }
        } catch (_: java.net.UnknownHostException) {
         errorId = R.string.pair_error_network
         page = PairPage.CONFIRM
        } catch (_: java.io.IOException) {
         errorId = R.string.pair_error_network
         page = PairPage.CONFIRM
        } catch (_: Exception) {
         errorId = R.string.pair_error_generic
         page = PairPage.CONFIRM
        } finally { claimPending = false }
       }
      }
     })
     PairLink(copy.get(R.string.pair_rescan)) {
      token = ""; previewJSON=""; errorId = 0; enterScanner()
     }
    }
   }
   PairPage.CONNECTING -> {
    Column(
     Modifier.weight(1f).fillMaxWidth().padding(horizontal = 24.dp),
     horizontalAlignment = Alignment.CenterHorizontally,
     verticalArrangement = Arrangement.Center
    ) {
     PairIconTile("spinner")
     Spacer(Modifier.height(18.dp))
     PairTitle(copy.get(R.string.pair_connecting))
     Spacer(Modifier.height(8.dp))
     PairBody(copy.get(R.string.pair_connecting_body))
    }
   }
   PairPage.CODE -> {
    Column(
     Modifier.weight(1f).fillMaxWidth().padding(top = 36.dp, start = 16.dp, end = 16.dp),
     horizontalAlignment = Alignment.CenterHorizontally
    ) {
     PairTitle(copy.get(R.string.pair_code_title))
     Spacer(Modifier.height(8.dp))
     PairBody(copy.get(R.string.pair_code_body))
     PairTokenEntry(
      value = input,
      onValueChange = { entered ->
       input = entered
       errorId = 0

      }
     )
     PairLink(copy.get(R.string.pair_paste)) {
      // Clipboard is touched ONLY after this explicit user action.
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      val pasted = clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString().orEmpty()
      val parsed = PairingToken.parse(pasted)
      if (parsed == null) errorId = R.string.pair_empty_clipboard
      else {
       input = parsed; errorId = 0
      }
     }
    }
    PairingBottom(copy.get(R.string.pair_verify_code), {
     val parsed=PairingToken.parse(input)
     if(parsed==null) errorId=R.string.pair_error_format else lookup(parsed)
    }, copy.get(R.string.pair_scan), { enterScanner() })
   }
  }
  if (errorId != 0) {
   Text(
    copy.get(errorId), color = p.danger, style = EkmivoType.heroNote,
    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
    textAlign = TextAlign.Center
   )
  }
 }
}

@Composable
private fun PairingHeader(title: String, subtitle: String?, bn: Boolean, onLanguageChange: (Boolean) -> Unit) {
 val p = LocalEkmivoPalette.current
 Row(
  Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
  horizontalArrangement = Arrangement.spacedBy(10.dp),
  verticalAlignment = Alignment.CenterVertically
 ) {
  Box(
   Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(p.text),
   contentAlignment = Alignment.Center
  ) {
   Text("e.", color = p.onPrimary, fontSize = 16.sp, fontWeight = FontWeight.Medium)
  }
  Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
   Text(title, style = EkmivoType.shop, color = p.text)
   if (subtitle != null) Text(subtitle, style = EkmivoType.meta, color = p.secondary)
  }
  Spacer(Modifier.weight(1f))
  EkmivoLanguageSwitch(bn=bn,onChange=onLanguageChange)
 }
}

@Composable
private fun ColumnScope.PairingWelcome(copy: PairCopy, bn: Boolean, onScan: () -> Unit, onCode: () -> Unit) {
 val p = LocalEkmivoPalette.current
 Column(
  Modifier.fillMaxWidth().weight(1f).padding(horizontal = 24.dp),
  horizontalAlignment = Alignment.CenterHorizontally,
  verticalArrangement = Arrangement.Center
 ) {
  PairIconTile("phone")
  Spacer(Modifier.height(18.dp))
  PairTitle(copy.get(R.string.pair_welcome_title))
  Spacer(Modifier.height(8.dp))
  PairBody(copy.get(R.string.pair_welcome_body))
  Spacer(Modifier.height(20.dp))
  Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.surface)) {
   listOf(R.string.pair_step_1, R.string.pair_step_2, R.string.pair_step_3).forEachIndexed { index, id ->
    Row(
     Modifier.fillMaxWidth()
      .then(if (index > 0) Modifier.topHairline(p.border) else Modifier)
      .padding(horizontal = 12.dp, vertical = 10.dp),
     verticalAlignment = Alignment.CenterVertically,
     horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
     Box(
      Modifier.size(20.dp).border(1.dp, p.border, CircleShape),
      contentAlignment = Alignment.Center
     ) {
      Text(
       displayDigits((index + 1).toString(), bn), style = EkmivoType.meta, color = p.secondary,
       fontSize = 11.sp
      )
     }
     Text(copy.get(id), style = EkmivoType.body, color = p.text,
      maxLines = 3, overflow = TextOverflow.Ellipsis)
    }
   }
  }
 }
 PairingBottom(copy.get(R.string.pair_scan), onScan, copy.get(R.string.pair_code_link), onCode)
}

@Composable
private fun ColumnScope.PairViewport(children: @Composable BoxScope.() -> Unit) {
 val p = LocalEkmivoPalette.current
 Box(
  Modifier.fillMaxWidth().weight(1f).padding(horizontal = 16.dp, vertical = 10.dp)
   .clip(RoundedCornerShape(20.dp))
   .background(Color(0xFF0A0A09))
   .border(1.dp, p.border, RoundedCornerShape(20.dp)),
  contentAlignment = Alignment.Center, content = children
 )
}

@Composable
private fun PairTitle(value: String) {
 val p = LocalEkmivoPalette.current
 Text(value, style = EkmivoType.centerTitle, color = p.text, textAlign = TextAlign.Center)
}

@Composable
private fun PairBody(value: String) {
 val p = LocalEkmivoPalette.current
 Text(value, style = EkmivoType.body, color = p.secondary, textAlign = TextAlign.Center)
}

@Composable
private fun PairingBottom(
 primary: String?, onPrimary: (() -> Unit)?,
 link: String?, onLink: (() -> Unit)?
) {
 Column(
  Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
  horizontalAlignment = Alignment.CenterHorizontally
 ) {
  if (primary != null && onPrimary != null) EkmivoPrimaryButton(primary, onClick = onPrimary)
  if (link != null && onLink != null) PairLink(link, onLink)
 }
}

@Composable
private fun PairLink(text: String, onClick: () -> Unit) {
 val p = LocalEkmivoPalette.current
 val interactions = remember { MutableInteractionSource() }
 Box(
  Modifier.fillMaxWidth().heightIn(min = 38.dp).clip(RoundedCornerShape(8.dp))
   .clickable(interactionSource = interactions, indication = null, onClick = onClick)
   .padding(top = 10.dp),
  contentAlignment = Alignment.Center
 ) {
  Text(text, style = EkmivoType.link, color = p.secondary, textAlign = TextAlign.Center)
 }
}

@Composable
private fun PairActionPill(text: String, selected: Boolean, onClick: () -> Unit) {
 val p = LocalEkmivoPalette.current
 Box(
  Modifier.clip(CircleShape).background(p.surface)
   .border(1.dp, if (selected) p.text else p.border, CircleShape)
   .clickable(onClick = onClick)
   .padding(horizontal = 10.dp, vertical = 4.dp)
 ) {
  Text(text, style = EkmivoType.meta, color = if (selected) p.text else p.secondary)
 }
}

/** One invisible native text editor drives all eight visible, single-character cells. */
@Composable
private fun PairTokenEntry(value: String, onValueChange: (String) -> Unit) {
 val p = LocalEkmivoPalette.current
 val focus = remember { FocusRequester() }
 val keyboard = LocalSoftwareKeyboardController.current
 val interactions = remember { MutableInteractionSource() }
 LaunchedEffect(Unit) { focus.requestFocus(); keyboard?.show() }
 BasicTextField(
  value = value,
  onValueChange = { raw ->
   // IME typing and multi-character clipboard insertion share one path.
   val normalized = PairingToken.normalize(raw)
   onValueChange(normalized)
  },
  singleLine = true,
  keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
  textStyle = TextStyle(fontSize = 1.sp, color = Color.Transparent),
  cursorBrush = SolidColor(Color.Transparent),
  modifier = Modifier.fillMaxWidth()
   .focusRequester(focus)
   .padding(top = 20.dp, bottom = 6.dp),
  decorationBox = { field ->
   Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
    Row(
     modifier = Modifier.clickable(
      interactionSource = interactions, indication = null
     ) { focus.requestFocus(); keyboard?.show() },
     horizontalArrangement = Arrangement.spacedBy(6.dp),
     verticalAlignment = Alignment.CenterVertically
    ) {
     repeat(PairingToken.LENGTH) { position ->
      if (position == 4) Text("–", color = p.secondary, style = EkmivoType.heroNote)
      Box(
       Modifier.size(width = 26.dp, height = 38.dp)
        .clip(RoundedCornerShape(8.dp))
        .background(p.surface)
        .border(1.dp, if (position == value.length && value.length < PairingToken.LENGTH) p.text else p.border,
         RoundedCornerShape(8.dp)),
       contentAlignment = Alignment.Center
      ) {
       Text(value.getOrNull(position)?.toString().orEmpty(),
        color = p.text, fontSize = 15.sp, maxLines = 1)
      }
     }
    }
    Box(Modifier.size(1.dp)) { field() }
   }
  }
 )
}

@Composable
private fun PairIconTile(kind: String) {
 val p = LocalEkmivoPalette.current
 Box(
  Modifier.size(76.dp).clip(RoundedCornerShape(24.dp))
   .background(p.surface).border(1.dp, p.border, RoundedCornerShape(24.dp)),
  contentAlignment = Alignment.Center
 ) {
  if (kind == "spinner") {
   val transition = rememberInfiniteTransition(label = "connecting")
   val angle by transition.animateFloat(
    0f, 360f, animationSpec = infiniteRepeatable(tween(1000, easing = LinearEasing)),
    label = "rotation"
   )
   Canvas(Modifier.size(34.dp).graphicsLayer { rotationZ = angle }) {
    val width = 3.dp.toPx()
    drawArc(p.border, 0f, 360f, false, style = Stroke(width))
    drawArc(p.text, -90f, 95f, false, style = Stroke(width, cap = StrokeCap.Round))
   }
  } else {
   EkmivoReferenceIcon(if(kind=="camera") EkmivoGlyph.CAM else EkmivoGlyph.PHN,size=32.dp)

  }
 }
}
