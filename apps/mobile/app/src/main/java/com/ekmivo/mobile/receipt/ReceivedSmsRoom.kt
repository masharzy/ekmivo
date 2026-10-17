package com.ekmivo.mobile.receipt

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Staging is a new, separate Room database. Do NOT try to let Room "adopt"
 * receipt-outbox.db v2: its historic SQLite schema has different constraints,
 * and the signed delivery queue must remain intact on upgrade.
 *
 * encryptedBody uses Android Keystore AES-GCM (AAD includes stable event ID).
 * This database never contains SMS plaintext.
 */
@Entity(tableName = "received_sms", indices = [Index(value = ["status"])])
data class ReceivedSms(
 @PrimaryKey val id: String,
 @ColumnInfo(name = "encrypted_body", typeAffinity = ColumnInfo.BLOB) val encryptedBody: ByteArray,
 @ColumnInfo(name = "created_at") val createdAt: Long,
 val status: String = "received",
 val attempts: Int = 0,
 @ColumnInfo(name = "last_error") val lastError: String = "",
 @ColumnInfo(name = "sent_at") val sentAt: Long? = null
)

@Dao
interface ReceivedSmsDao {
 @Insert(onConflict = OnConflictStrategy.IGNORE)
 fun insert(receipt: ReceivedSms): Long

 @Query("SELECT * FROM received_sms WHERE status != 'sent' ORDER BY created_at, id LIMIT :limit")
 fun unacknowledged(limit: Int = 500): List<ReceivedSms>

 @Query("SELECT count(*) FROM received_sms WHERE status != 'sent'")
 fun countUnacknowledged(): Int

 @Query("UPDATE received_sms SET status='mirrored',last_error='' WHERE id=:id AND status != 'sent'")
 fun mirrored(id: String)

 @Query("UPDATE received_sms SET status='sending',attempts=attempts+1 WHERE id=:id AND status != 'sent'")
 fun sending(id: String)

 @Query("UPDATE received_sms SET status='failed',last_error=:safeCode WHERE id=:id AND status != 'sent'")
 fun failed(id: String, safeCode: String)

 @Query("UPDATE received_sms SET status='sent',sent_at=:at,last_error='' WHERE id=:id")
 fun acknowledged(id: String, at: Long = System.currentTimeMillis())

 @Query("DELETE FROM received_sms WHERE status='sent' AND id NOT IN (SELECT id FROM received_sms WHERE status='sent' ORDER BY sent_at DESC,id DESC LIMIT 60)")
 fun pruneSent()
}

@Database(entities = [ReceivedSms::class], version = 1, exportSchema = false)
abstract class ReceivedSmsRoom : RoomDatabase() {
 abstract fun messages(): ReceivedSmsDao

 companion object {
  @Volatile private var instance: ReceivedSmsRoom? = null
  fun get(context: Context): ReceivedSmsRoom = instance ?: synchronized(this) {
   instance ?: Room.databaseBuilder(context.applicationContext, ReceivedSmsRoom::class.java,
    "receipt-staging-room.db").build().also { instance = it }
  }
 }
}
