package com.briofold.mobile.ui

internal fun workspacePages(ai:Boolean,payments:Boolean)=buildList {
 if(ai)add(BriofoldReferencePage.INBOX)
 if(payments)add(BriofoldReferencePage.SMS)
 add(BriofoldReferencePage.SETTINGS)
}
internal fun workspacePage(selected:BriofoldReferencePage,ai:Boolean,payments:Boolean)=workspacePages(ai,payments).let{if(selected in it)selected else it.first()}
