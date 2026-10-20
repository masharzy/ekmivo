package com.ekmivo.mobile.ui
import org.junit.Assert.*
import org.junit.Test
class WorkspaceNavigationTest {
 @Test fun productsReplacePagesWithoutRestart(){
  assertEquals(listOf(EkmivoReferencePage.INBOX,EkmivoReferencePage.SETTINGS),workspacePages(true,false))
  assertEquals(listOf(EkmivoReferencePage.SMS,EkmivoReferencePage.SETTINGS),workspacePages(false,true))
  assertEquals(listOf(EkmivoReferencePage.INBOX,EkmivoReferencePage.SMS,EkmivoReferencePage.SETTINGS),workspacePages(true,true))
  assertEquals(listOf(EkmivoReferencePage.SETTINGS),workspacePages(false,false))
  assertEquals(EkmivoReferencePage.SMS,workspacePage(EkmivoReferencePage.INBOX,false,true))
  assertEquals(EkmivoReferencePage.SETTINGS,workspacePage(EkmivoReferencePage.INBOX,false,false))
 }
}
