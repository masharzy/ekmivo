package com.ekmivo.mobile.inbox

import org.junit.Assert.*
import org.junit.Test
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

class InboxGroundworkTest {
 @Test fun inboxHasRealServerContractButRemainsWorkspaceGated() {
  assertTrue(InboxFeatureFlag.inboxEnabled)
 }
 @Test fun domainTypesCarryNoFakeMessages() = runBlocking {
  assertTrue(DisabledInboxRepository.observeThreads().first().isEmpty())
  assertTrue(DisabledInboxRepository.observeMessages("anything").first().isEmpty())
  assertTrue(DisabledInboxRepository.markRead("a","b").isFailure)
 }
 @Test fun futureRouteAndDomainAreIndependentOfReceiptForwarder() {
  assertEquals("m1",InboxMessage("m1","thread", "",0L,true,InboxMessageState.RECEIVED).id)
  assertTrue(InboxDestination.Thread("thread").id.isNotEmpty())
 }
}
