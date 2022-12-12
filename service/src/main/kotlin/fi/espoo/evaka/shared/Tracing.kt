// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.shared

import com.google.common.hash.HashCode
import fi.espoo.evaka.shared.security.Action
import io.opentracing.Span
import io.opentracing.Tracer
import io.opentracing.Tracer.SpanBuilder
import io.opentracing.tag.AbstractTag
import io.opentracing.tag.Tag
import io.opentracing.tag.Tags

object Tracing {
    val action = ToStringTag<Action>("action")
    val actionClass = ToStringTag<Class<out Any>>("actionclass")
    val enduserIdHash = ToStringTag<HashCode>("enduser.idhash")
}

@Suppress("NOTHING_TO_INLINE")
inline infix fun <T> Tag<T>.withValue(value: T) = TagValue(this, value)

class ToStringTag<T>(key: String) : AbstractTag<T>(key) {
    override fun set(span: Span, tagValue: T) {
        span.setTag(key, tagValue.toString())
    }
}

data class TagValue<T>(val tag: Tag<T>, val value: T)

fun <T> SpanBuilder.withTag(tagValue: TagValue<T>): SpanBuilder =
    withTag(tagValue.tag, tagValue.value)

inline fun <T> Tracer.withSpan(span: Span, crossinline f: () -> T): T =
    try {
        activateSpan(span).use { f() }
    } catch (e: Exception) {
        span.setTag(Tags.ERROR, true)
        throw e
    } finally {
        span.finish()
    }

inline fun <T> Tracer.withSpan(
    operationName: String,
    vararg tags: TagValue<*>,
    crossinline f: () -> T
): T =
    withSpan(
        buildSpan(operationName).let { tags.fold(it) { span, tag -> span.withTag(tag) } }.start(),
        f
    )
