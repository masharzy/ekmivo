package com.briofold.mobile.receipt

import android.annotation.SuppressLint
import android.content.Context
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Real in-screen CameraX viewport with ML Kit QR analysis. No preview frames
 * are saved to disk or uploaded. Scanner is never used before CAMERA consent.
 */
@SuppressLint("UnsafeOptInUsageError")
@OptIn(ExperimentalGetImage::class)
@Composable
fun PairingCamera(
 torchRequested: Boolean,
 onToken: (String) -> Unit,
 onCameraError: () -> Unit,
 modifier: Modifier = Modifier
) {
 val context = androidx.compose.ui.platform.LocalContext.current
 val owner = LocalLifecycleOwner.current
 val previewView = remember { PreviewView(context).apply {
  scaleType = PreviewView.ScaleType.FILL_CENTER
  implementationMode = PreviewView.ImplementationMode.COMPATIBLE
 } }
 var camera by remember { mutableStateOf<Camera?>(null) }
 AndroidView(factory = { previewView }, modifier = modifier.fillMaxSize())
 DisposableEffect(owner, previewView) {
  val executor = Executors.newSingleThreadExecutor()
  val active = AtomicBoolean(true)
  val decoding = AtomicBoolean(false)
  val completed = AtomicBoolean(false)
  val scanner = BarcodeScanning.getClient(
   BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
  )
  val future = ProcessCameraProvider.getInstance(context)
  var provider: ProcessCameraProvider? = null
  future.addListener({
   if (!active.get()) return@addListener
   runCatching {
    val cameraProvider = future.get()
    provider = cameraProvider
    val preview = Preview.Builder().build().also {
     it.surfaceProvider = previewView.surfaceProvider
    }
    val analyzer = ImageAnalysis.Builder()
     .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
     .build()
    analyzer.setAnalyzer(executor) { imageProxy ->
     val image = imageProxy.image
     if (!active.get() || image == null || !decoding.compareAndSet(false, true)) {
      imageProxy.close()
     } else {
      val input = InputImage.fromMediaImage(image, imageProxy.imageInfo.rotationDegrees)
      scanner.process(input)
       .addOnSuccessListener(ContextCompat.getMainExecutor(context)) { barcodes ->
        if (active.get() && !completed.get()) {
         val token = barcodes.firstNotNullOfOrNull { PairingToken.parse(it.rawValue ?: "") }
         if (token != null && completed.compareAndSet(false, true)) onToken(token)
        }
       }
       .addOnFailureListener(ContextCompat.getMainExecutor(context)) {
        // One undecodable frame is normal: never interrupt an active viewfinder.
       }
       .addOnCompleteListener(ContextCompat.getMainExecutor(context)) {
        decoding.set(false)
        imageProxy.close()
       }
     }
    }
    cameraProvider.unbindAll()
    camera = cameraProvider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analyzer)
   }.onFailure { if (active.get()) onCameraError() }
  }, ContextCompat.getMainExecutor(context))
  onDispose {
   active.set(false)
   camera?.cameraControl?.enableTorch(false)
   provider?.unbindAll()
   scanner.close()
   executor.shutdown()
   camera = null
  }
 }
 LaunchedEffect(camera, torchRequested) {
  camera?.cameraControl?.enableTorch(torchRequested)
 }
}
