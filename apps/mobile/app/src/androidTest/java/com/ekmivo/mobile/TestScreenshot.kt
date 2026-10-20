package com.ekmivo.mobile

import android.content.ContentValues
import android.graphics.Bitmap
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.test.platform.app.InstrumentationRegistry

/** Shared test-only images survive AGP uninstalling the test app after execution. */
internal fun saveTestScreenshot(name:String,bitmap:Bitmap,album:String) {
 require(Build.VERSION.SDK_INT>=29){"Screenshot export requires the configured API 35 emulator"}
 val resolver=InstrumentationRegistry.getInstrumentation().targetContext.contentResolver
 val values=ContentValues().apply {
  put(MediaStore.Images.Media.DISPLAY_NAME,name)
  put(MediaStore.Images.Media.MIME_TYPE,"image/png")
  put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/"+album)
  put(MediaStore.Images.Media.IS_PENDING,1)
 }
 val uri=checkNotNull(resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values))
 try {
  checkNotNull(resolver.openOutputStream(uri)).use{check(bitmap.compress(Bitmap.CompressFormat.PNG,100,it))}
  resolver.update(uri,ContentValues().apply{put(MediaStore.Images.Media.IS_PENDING,0)},null,null)
 }catch(error:Throwable){resolver.delete(uri,null,null);throw error}
}
