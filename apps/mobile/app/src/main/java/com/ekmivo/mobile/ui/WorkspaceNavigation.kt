package com.ekmivo.mobile.ui

internal fun workspacePages(ai:Boolean,payments:Boolean)=buildList {
 if(ai)add(EkmivoReferencePage.INBOX)
 if(payments)add(EkmivoReferencePage.SMS)
 add(EkmivoReferencePage.SETTINGS)
}
internal fun workspacePage(selected:EkmivoReferencePage,ai:Boolean,payments:Boolean)=workspacePages(ai,payments).let{if(selected in it)selected else it.first()}
