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
import androidx.room.Transaction
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

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
 @ColumnInfo(defaultValue="''") val origin: String = "",
 val status: String = "received",
 val attempts: Int = 0,
 @ColumnInfo(name = "last_error") val lastError: String = "",
 @ColumnInfo(name = "sent_at") val sentAt: Long? = null
)

@Entity(tableName="receipt_delivery_days",primaryKeys=["origin","day"])
data class ReceiptDeliveryDay(val origin:String,val day:String,val count:Int=0)

@Dao
interface ReceivedSmsDao {
 @Insert(onConflict = OnConflictStrategy.IGNORE)
 fun insert(receipt: ReceivedSms): Long

 @Query("SELECT * FROM received_sms WHERE status != 'sent' ORDER BY created_at, id LIMIT :limit")
 fun unacknowledged(limit: Int): List<ReceivedSms>

 /** Durable-ACK timestamp; not the original SMS intake timestamp. */
 @Query("SELECT MAX(sent_at) FROM received_sms WHERE status='sent'")
 fun latestAckAt(): Long?

 @Query("SELECT count(*) FROM received_sms WHERE status != 'sent'")
 fun countUnacknowledged(): Int

 @Query("UPDATE received_sms SET status='mirrored',last_error='' WHERE id=:id AND status != 'sent'")
 fun mirrored(id: String)

 @Query("UPDATE received_sms SET status='sending',attempts=attempts+1 WHERE id=:id AND status != 'sent'")
 fun sending(id: String)

 @Query("UPDATE received_sms SET status='failed',last_error=:safeCode WHERE id=:id AND status != 'sent'")
 fun failed(id: String, safeCode: String)

 @Query("UPDATE received_sms SET status='sent',sent_at=:at,last_error='' WHERE id=:id")
 fun acknowledged(id: String, at: Long)

 @Query("SELECT * FROM received_sms WHERE id=:id")
 fun byId(id:String):ReceivedSms?
 @Query("INSERT OR IGNORE INTO receipt_delivery_days(origin,day,count) VALUES(:origin,:day,0)")
 fun ensureDay(origin:String,day:String)
 @Query("UPDATE receipt_delivery_days SET count=count+1 WHERE origin=:origin AND day=:day")
 fun incrementDay(origin:String,day:String)
 @Query("SELECT COALESCE(SUM(count),0) FROM receipt_delivery_days WHERE origin=:origin AND day>=:since")
 fun countSince(origin:String,since:String):Int
 @Transaction fun acknowledgeWithStats(id:String,at:Long) {
  val row=byId(id)?:return
  if(row.status=="sent")return
  if(row.origin.isNotBlank()) {
   val day=java.time.Instant.ofEpochMilli(at).atZone(java.time.ZoneId.of("Asia/Dhaka")).toLocalDate().toString()
   ensureDay(row.origin,day);incrementDay(row.origin,day)
  }
  acknowledged(id,at)
 }

 @Query("DELETE FROM received_sms WHERE status='sent' AND id NOT IN (SELECT id FROM received_sms WHERE status='sent' ORDER BY sent_at DESC,id DESC LIMIT 60)")
 fun pruneSent()
}

@Database(entities = [ReceivedSms::class,ReceiptDeliveryDay::class], version = 2, exportSchema = false)
abstract class ReceivedSmsRoom : RoomDatabase() {
 abstract fun messages(): ReceivedSmsDao

 companion object {
  @Volatile private var instance: ReceivedSmsRoom? = null
  fun get(context: Context): ReceivedSmsRoom = instance ?: synchronized(this) {
   instance ?: Room.databaseBuilder(context.applicationContext, ReceivedSmsRoom::class.java,
    "receipt-staging-room.db").addMigrations(object:Migration(1,2){
    override fun migrate(db:SupportSQLiteDatabase){
     db.execSQL("ALTER TABLE received_sms ADD COLUMN origin TEXT NOT NULL DEFAULT ''")
     db.execSQL("CREATE TABLE IF NOT EXISTS receipt_delivery_days (origin TEXT NOT NULL,day TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(origin,day))")
    }
   }).build().also { instance = it }
  }
 }
}
