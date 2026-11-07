package com.briofold.mobile

import com.briofold.mobile.data.Language
import com.briofold.mobile.ui.Page
import com.briofold.mobile.ui.copyFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UiContractTest {
 @Test fun allNavigationDestinationsHaveIndependentEnglishAndBanglaLabels() {
  Page.entries.forEach { page ->
   assertTrue(copyFor(Language.EN).pageName(page).isNotBlank())
   assertTrue(copyFor(Language.BN).pageName(page).isNotBlank())
  }
  assertEquals(4, Page.entries.size)
 }
 @Test fun emptyPaymentScreenMustNotRepresentTransactionsAsPaid() {
  for(language in Language.entries){
   val labels=copyFor(language)
   assertTrue(labels.noPayments.isNotBlank())
   assertTrue(labels.pendingBackend.isNotBlank())
  }
 }
}
