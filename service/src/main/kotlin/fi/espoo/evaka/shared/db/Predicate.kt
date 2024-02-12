// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.shared.db

import org.intellij.lang.annotations.Language

/**
 * Raw SQL predicate, i.e. an expression that returns a boolean and could be used after WHERE in a
 * query.
 *
 * Automatically adds parentheses around itself when rendered, so there's no need to worry about OR
 * operator precedence or other issues when using them.
 */
@JvmInline
value class PredicateSqlString(@Language("sql", prefix = "SELECT WHERE ") private val sql: String) {
    override fun toString(): String = "($sql)"
}

/**
 * A high-level query predicate that checks some kind of condition against *exactly one database
 * table* and returns a boolean.
 *
 * The database table is unspecified, and the same predicate can be used for one or more tables by
 * calling `forTable`.
 *
 * Any parameter bindings in the predicate are automatically carried over to the final SQL query
 * when the predicate is used.
 *
 * Example:
 * ```
 * val predicate = Predicate { where("$it.some_column = ${bind(someValue)}") }
 * ```
 */
sealed interface Predicate<Tag> {
    fun forTable(table: String): PredicateSql

    fun and(other: Predicate<Tag>): Predicate<Tag> = all(this, other)

    fun or(other: Predicate<Tag>): Predicate<Tag> = any(this, other)

    @JvmInline
    private value class Single<Tag>(val f: PredicateSql.Builder.(table: String) -> PredicateSql) :
        Predicate<Tag> {
        override fun forTable(table: String): PredicateSql =
            PredicateSql.Builder().run { (f)(table) }
    }

    private data object AlwaysTrue : Predicate<Any> {
        override fun forTable(table: String): PredicateSql = PredicateSql.alwaysTrue()
    }

    private data object AlwaysFalse : Predicate<Any> {
        override fun forTable(table: String): PredicateSql = PredicateSql.alwaysFalse()
    }

    private data class AnyOperator<Tag>(val predicates: List<Predicate<Tag>>) : Predicate<Tag> {
        override fun forTable(table: String): PredicateSql =
            PredicateSql.any(predicates.map { it.forTable(table) })
    }

    private data class AllOperator<Tag>(val predicates: List<Predicate<Tag>>) : Predicate<Tag> {
        override fun forTable(table: String): PredicateSql =
            PredicateSql.all(predicates.map { it.forTable(table) })
    }

    companion object {
        /** Returns a predicate using a builder function that accepts a table name as a parameter */
        operator fun <Tag> invoke(
            f: PredicateSql.Builder.(table: String) -> PredicateSql
        ): Predicate<Tag> = Single(f)

        /**
         * Returns a predicate that is always true, regardless of how it's used or which table it is
         * later bound to
         */
        @Suppress("UNCHECKED_CAST")
        fun <Tag> alwaysTrue(): Predicate<Tag> = AlwaysTrue as Predicate<Tag>

        /**
         * Returns a predicate that is always false, regardless of how it's used or which table it
         * is later bound to
         */
        @Suppress("UNCHECKED_CAST")
        fun <Tag> alwaysFalse(): Predicate<Tag> = AlwaysFalse as Predicate<Tag>

        /**
         * Returns a predicate that returns true if all the given predicates that are not null
         * return true.
         *
         * If no non-null predicates are given, the returned predicate returns *true*.
         */
        fun <Tag> allNotNull(vararg predicates: Predicate<Tag>?): Predicate<Tag> =
            all(predicates.filterNotNull())

        /**
         * Returns a predicate that returns true if all the given predicates return true.
         *
         * If no predicates are given, the returned predicate returns *true*.
         */
        fun <Tag> all(vararg predicates: Predicate<Tag>): Predicate<Tag> = all(predicates.toList())

        /**
         * Returns a predicate that returns true if all the given predicates return true.
         *
         * If no predicates are given, the returned predicate returns *true*.
         */
        fun <Tag> all(predicates: Iterable<Predicate<Tag>>): Predicate<Tag> =
            AllOperator(predicates.toList())

        /**
         * Returns a predicate that returns true if any of the given predicates that are not null
         * returns true.
         *
         * If no non-null predicates are given, the returned predicate returns *false*.
         */
        fun <Tag> anyNotNull(vararg predicates: Predicate<Tag>?): Predicate<Tag> =
            any(predicates.filterNotNull())

        /**
         * Returns a predicate that returns true if any of the given predicates returns true.
         *
         * If no predicates are given, the returned predicate returns *false*.
         */
        fun <Tag> any(vararg predicates: Predicate<Tag>): Predicate<Tag> = any(predicates.toList())

        /**
         * Returns a predicate that returns true if any of the given predicates returns true.
         *
         * If no predicates are given, the returned predicate returns *false*.
         */
        fun <Tag> any(predicates: Iterable<Predicate<Tag>>): Predicate<Tag> =
            AnyOperator(predicates.toList())
    }
}

/**
 * SQL predicate, i.e. an expression that returns a boolean and could be used after WHERE in a
 * query.
 */
sealed interface PredicateSql {
    val sql: PredicateSqlString
    val bindings: List<ValueBinding<out Any?>>

    fun and(other: PredicateSql): PredicateSql =
        when (other) {
            is AlwaysTrue -> this
            is AlwaysFalse -> other
            is AndOperator -> AndOperator(listOf(this) + other.predicates)
            is Single,
            is OrOperator -> AndOperator(listOf(this, other))
        }

    fun or(other: PredicateSql): PredicateSql =
        when (other) {
            is AlwaysFalse -> this
            is AlwaysTrue -> other
            is OrOperator -> OrOperator(listOf(this) + other.predicates)
            is Single,
            is AndOperator -> OrOperator(listOf(this, other))
        }

    private data class Single(
        override val sql: PredicateSqlString,
        override val bindings: List<ValueBinding<out Any?>>
    ) : PredicateSql

    private data object AlwaysTrue : PredicateSql {
        override val sql = PredicateSqlString("TRUE")
        override val bindings = emptyList<ValueBinding<out Any?>>()

        override fun or(other: PredicateSql): PredicateSql = this

        override fun and(other: PredicateSql): PredicateSql = other
    }

    private data object AlwaysFalse : PredicateSql {
        override val sql = PredicateSqlString("FALSE")
        override val bindings = emptyList<ValueBinding<out Any?>>()

        override fun or(other: PredicateSql): PredicateSql = other

        override fun and(other: PredicateSql): PredicateSql = this
    }

    private data class OrOperator(val predicates: List<PredicateSql>) : PredicateSql {
        override val sql
            get() = PredicateSqlString(predicates.joinToString(" OR ") { it.sql.toString() })

        override val bindings: List<ValueBinding<out Any?>>
            get() = predicates.flatMap { it.bindings }

        override fun or(other: PredicateSql): PredicateSql =
            when (other) {
                is AlwaysFalse -> this
                is AlwaysTrue -> other
                is OrOperator -> OrOperator(this.predicates + other.predicates)
                is AndOperator,
                is Single -> OrOperator(this.predicates + other)
            }
    }

    private data class AndOperator(val predicates: List<PredicateSql>) : PredicateSql {
        override val sql
            get() = PredicateSqlString(predicates.joinToString(" AND ") { it.sql.toString() })

        override val bindings: List<ValueBinding<out Any?>>
            get() = predicates.flatMap { it.bindings }

        override fun and(other: PredicateSql): PredicateSql =
            when (other) {
                is AlwaysTrue -> this
                is AlwaysFalse -> other
                is AndOperator -> AndOperator(this.predicates + other.predicates)
                is OrOperator,
                is Single -> AndOperator(this.predicates + other)
            }
    }

    class Builder : SqlBuilder() {
        private var used: Boolean = false

        fun where(@Language("sql", prefix = "SELECT WHERE ") sql: String): PredicateSql {
            check(!used) { "builder has already been used" }
            this.used = true
            return when (sql) {
                "" -> throw IllegalArgumentException("Predicate cannot be empty")
                "TRUE",
                "true" -> AlwaysTrue
                "FALSE",
                "false" -> AlwaysFalse
                else -> Single(PredicateSqlString(sql), bindings)
            }
        }
    }

    companion object {
        operator fun invoke(f: Builder.() -> PredicateSql): PredicateSql = Builder().run { (f)() }

        fun alwaysTrue(): PredicateSql = AlwaysTrue

        fun alwaysFalse(): PredicateSql = AlwaysFalse

        /**
         * Returns a predicate that returns true if all the given predicates that are not null
         * return true.
         *
         * If no non-null predicates are given, the returned predicate returns *true*.
         */
        fun allNotNull(vararg predicates: PredicateSql?): PredicateSql =
            all(predicates.filterNotNull())

        /**
         * Returns a predicate that returns true if all the given predicates return true.
         *
         * If no predicates are given, the returned predicate returns *true*.
         */
        fun all(vararg predicates: PredicateSql): PredicateSql = all(predicates.toList())

        /**
         * Returns a predicate that returns true if all the given predicates return true.
         *
         * If no predicates are given, the returned predicate returns *true*.
         */
        fun all(predicates: Collection<PredicateSql>): PredicateSql =
            predicates.reduceOrNull(PredicateSql::and) ?: alwaysTrue()

        /**
         * Returns a predicate that returns true if any of the given predicates that are not null
         * returns true.
         *
         * If no non-null predicates are given, the returned predicate returns *false*.
         */
        fun anyNotNull(vararg predicates: PredicateSql?): PredicateSql =
            any(predicates.filterNotNull())

        /**
         * Returns a predicate that returns true if any of the given predicates returns true.
         *
         * If no predicates are given, the returned predicate returns *false*.
         */
        fun any(vararg predicates: PredicateSql): PredicateSql = any(predicates.toList())

        /**
         * Returns a predicate that returns true if any of the given predicates returns true.
         *
         * If no predicates are given, the returned predicate returns *false*.
         */
        fun any(predicates: Collection<PredicateSql>): PredicateSql =
            predicates.reduceOrNull(PredicateSql::or) ?: alwaysFalse()
    }
}
