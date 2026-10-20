package com.ekmivo.mobile.inbox

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

/**
 * Future customer conversation surface. Activated only behind authoritative workspace AI access; FCM,
 * identity-based authorization, server routes and privacy review are complete.
 */
object InboxFeatureFlag {
 const val inboxEnabled = true
}

enum class InboxMessageState { RECEIVED, READ, SENT, FAILED }

data class InboxThread(
 val id:String,
 val customerDisplayName:String,
 val updatedAtMillis:Long,
 val unreadCount:Int
)

data class InboxMessage(
 val id:String,
 val threadId:String,
 val body:String,
 val createdAtMillis:Long,
 val inbound:Boolean,
 val state:InboxMessageState
)

/**
 * Backend-independent contract. There is no fake chat history, no fake ACKs.
 * A real implementation must scope every query to the current enrollment.
 */
interface InboxRepository {
 fun observeThreads():Flow<List<InboxThread>>
 fun observeMessages(threadId:String):Flow<List<InboxMessage>>
 suspend fun markRead(threadId:String,messageId:String):Result<Unit>
}

/** Safe disabled implementation — no message storage or uploads. */
object DisabledInboxRepository:InboxRepository {
 override fun observeThreads():Flow<List<InboxThread>> = flowOf(emptyList())
 override fun observeMessages(threadId:String):Flow<List<InboxMessage>> = flowOf(emptyList())
 override suspend fun markRead(threadId:String,messageId:String):Result<Unit> =
  Result.failure(UnsupportedOperationException("INBOX_NOT_ENABLED"))
}

/** Explicit future route, never reachable from the 2-item bottom nav. */
sealed interface InboxDestination {
 data object Threads:InboxDestination
 data class Thread(val id:String):InboxDestination
}
