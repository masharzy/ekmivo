package com.briofold.mobile.ui
import org.junit.Assert.*
import org.junit.Test
class WorkspaceNavigationTest {
 @Test fun productsReplacePagesWithoutRestart(){
  assertEquals(listOf(BriofoldReferencePage.INBOX,BriofoldReferencePage.SETTINGS),workspacePages(true,false))
  assertEquals(listOf(BriofoldReferencePage.SMS,BriofoldReferencePage.SETTINGS),workspacePages(false,true))
  assertEquals(listOf(BriofoldReferencePage.INBOX,BriofoldReferencePage.SMS,BriofoldReferencePage.SETTINGS),workspacePages(true,true))
  assertEquals(listOf(BriofoldReferencePage.SETTINGS),workspacePages(false,false))
  assertEquals(BriofoldReferencePage.SMS,workspacePage(BriofoldReferencePage.INBOX,false,true))
  assertEquals(BriofoldReferencePage.SETTINGS,workspacePage(BriofoldReferencePage.INBOX,false,false))
 }
}
