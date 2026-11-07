package com.briofold.mobile.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.briofoldDataStore by preferencesDataStore(name = "briofold_appearance")

enum class Appearance { SYSTEM, LIGHT, DARK }
enum class Language { BN, EN }

class AppPreferences(context: Context) {
 private val dataStore = context.applicationContext.briofoldDataStore
 private val themeKey = stringPreferencesKey("theme")
 private val languageKey = stringPreferencesKey("language")

 val appearance: Flow<Appearance> = dataStore.data.map { prefs ->
  Appearance.entries.find { it.name == prefs[themeKey] } ?: Appearance.SYSTEM
 }
 val language: Flow<Language> = dataStore.data.map { prefs ->
  Language.entries.find { it.name == prefs[languageKey] } ?: Language.EN
 }
 suspend fun updateAppearance(value: Appearance) {
  dataStore.edit { it[themeKey] = value.name }
 }
 suspend fun updateLanguage(value: Language) {
  dataStore.edit { it[languageKey] = value.name }
 }
}
