// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.voltti.logging.loggers

import io.github.oshai.kotlinlogging.KLogger
import net.logstash.logback.argument.StructuredArguments

/**
 * Extensions to allow adding meta-fields to app-misc logs without requiring StructuredArguments
 * wrapper and an unnecessary dependency to net.logstash.logback.
 */
fun KLogger.trace(meta: Map<String, Any?>, m: () -> Any?) = atTrace {
    message = m.toStringSafe()
    arguments = arrayOf(metaToLoggerArgs(meta))
}

fun KLogger.debug(meta: Map<String, Any?>, m: () -> Any?) = atDebug {
    message = m.toStringSafe()
    arguments = arrayOf(metaToLoggerArgs(meta))
}

fun KLogger.info(meta: Map<String, Any?>, m: () -> Any?) = atInfo {
    message = m.toStringSafe()
    arguments = arrayOf(metaToLoggerArgs(meta))
}

fun KLogger.warn(meta: Map<String, Any?>, m: () -> Any?) = atWarn {
    message = m.toStringSafe()
    arguments = arrayOf(metaToLoggerArgs(meta))
}

fun KLogger.error(meta: Map<String, Any?>, m: () -> Any?) = atError {
    message = m.toStringSafe()
    arguments = arrayOf(metaToLoggerArgs(meta))
}

fun KLogger.error(error: Throwable, meta: Map<String, Any?>, m: () -> Any?) = atError {
    message = m.toStringSafe()
    cause = error
    arguments = arrayOf(metaToLoggerArgs(meta))
}

private fun metaToLoggerArgs(meta: Map<String, Any?>) =
    StructuredArguments.entries(mapOf("meta" to meta))
