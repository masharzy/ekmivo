package com.ekmivo.mobile.ui

/** Display only. Never apply to pairing tokens, API fields, IDs or clipboard values. */
fun displayDigits(value: String, bangla: Boolean): String = if (!bangla) value else
    value.map { if (it in '0'..'9') "০১২৩৪৫৬৭৮৯"[it - '0'] else it }.joinToString("")
