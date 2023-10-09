// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.shared.db

import fi.espoo.evaka.shared.domain.NotFound
import fi.espoo.evaka.shared.withSpan
import io.opentracing.Tracer
import java.time.Duration
import java.util.Optional
import kotlin.reflect.KClass
import kotlin.reflect.KType
import kotlin.reflect.typeOf
import org.intellij.lang.annotations.Language
import org.jdbi.v3.core.Handle
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.core.kotlin.bindKotlin
import org.jdbi.v3.core.mapper.ColumnMapper
import org.jdbi.v3.core.mapper.RowViewMapper
import org.jdbi.v3.core.qualifier.QualifiedType
import org.jdbi.v3.core.result.ResultIterable
import org.jdbi.v3.core.result.RowView
import org.jdbi.v3.json.Json

// What does it mean when a function accepts a Database/Database.* parameter?
//
//     fun doStuff(db: Database):
//         To call this function, you need to have a database reference *without* an active
// connection or transaction.
//         The function can connect/disconnect from the database 0 to N times, and do whatever it
// wants using the connection(s).
//     fun doStuff(db: Database.Connection)
//         To call this function, you need to have a lazy database connection *without* an active
// transaction.
//         The function can read/write the database and freely execute 0 to N individual
// transactions. It may also close the connection temporarily and reuse it afterwards.
//     fun doStuff(tx: Database.Read)
//         To call this function, you need to have an active read-only transaction.
//         The function can only read the database, and can't manage transactions by itself.
//     fun doStuff(tx: Database.Transaction)
//         To call this function, you need to have an active transaction.
//         The function can read/write the database, and can't manage transactions by itself.

/**
 * A database reference that can be used to obtain *one database connection at a time*.
 *
 * Tied to the thread that created it, and throws `IllegalStateException` if used in the wrong
 * thread.
 */
class Database(private val jdbi: Jdbi, private val tracer: Tracer) {
    private val threadId = ThreadId()
    private var hasOpenHandle = false

    /**
     * Opens a database connection, runs the given function, and closes the connection.
     *
     * Throws `IllegalStateException` if a connection is already open
     */
    fun <T> connect(f: (db: Connection) -> T): T = connectWithManualLifecycle().use(f)

    /**
     * Opens a new database connection and returns it. The connection *must be closed after use*.
     *
     * Throws `IllegalStateException` if a connection is already open
     */
    fun connectWithManualLifecycle(): Connection {
        threadId.assertCurrentThread()
        check(!hasOpenHandle) { "Already connected to database" }
        return Connection(threadId, tracer, this::openHandle)
    }

    private fun openHandle(): Handle =
        jdbi.open().also {
            check(!hasOpenHandle) { "Already connected to database" }
            hasOpenHandle = true
            it.addCleanable { hasOpenHandle = false }
        }

    /**
     * A single *possibly open* database connection tied to a single thread.
     *
     * Whenever a transaction is started, the underlying raw handle is opened lazily. Once the
     * connection is closed with `close()` and any new transaction will once again lazily open a raw
     * handle.
     */
    open class Connection
    internal constructor(
        private val threadId: ThreadId,
        private val tracer: Tracer,
        private val openRawHandle: () -> Handle
    ) : AutoCloseable {
        private var rawHandle: Handle? = null

        private fun getRawHandle(): Handle = rawHandle ?: openRawHandle().also { rawHandle = it }

        /**
         * Enters read mode, runs the given function, and exits read mode regardless of any
         * exceptions the function may have thrown.
         *
         * Throws `IllegalStateException` if this database connection is already in read mode or a
         * transaction
         */
        fun <T> read(f: (db: Read) -> T): T {
            threadId.assertCurrentThread()
            val handle = this.getRawHandle()
            check(!handle.isInTransaction) { "Already in a transaction" }
            handle.isReadOnly = true
            try {
                return tracer.withSpan("db.transaction read") {
                    handle.inTransaction<T, Exception> { f(Read(handle)) }
                }
            } finally {
                handle.isReadOnly = false
            }
        }

        /**
         * Starts a transaction, runs the given function, and commits or rolls back the transaction
         * depending on whether the function threw an exception or not.
         *
         * Throws `IllegalStateException` if this database connection is already in read mode or a
         * transaction.
         */
        fun <T> transaction(f: (db: Transaction) -> T): T {
            threadId.assertCurrentThread()
            val handle = this.getRawHandle()
            check(!handle.isInTransaction) { "Already in a transaction" }
            val hooks = TransactionHooks()
            return tracer
                .withSpan("db.transaction read/write") {
                    handle.inTransaction<T, Exception> { f(Transaction(it, hooks)) }
                }
                .also { hooks.afterCommit.forEach { it() } }
        }

        override fun close() {
            threadId.assertCurrentThread()
            this.rawHandle?.close()
            this.rawHandle = null
        }
    }

    /**
     * A single database connection in read mode.
     *
     * Tied to the thread that created it, and throws `IllegalStateException` if used in the wrong
     * thread.
     */
    open class Read internal constructor(val handle: Handle) {
        fun createQuery(@Language("sql") sql: String): Query = Query(handle.createQuery(sql))

        fun <Tag> createQuery(f: QuerySql.Builder<Tag>.() -> QuerySql<Tag>): Query =
            createQuery(QuerySql.Builder<Tag>().run { f(this) })

        fun createQuery(fragment: QuerySql<*>): Query {
            val raw = handle.createQuery(fragment.sql.toString())
            for ((idx, binding) in fragment.bindings.withIndex()) {
                raw.bindByType(idx, binding.value, binding.type)
            }
            return Query(raw)
        }

        fun setLockTimeout(duration: Duration) =
            handle.execute("SET LOCAL lock_timeout = '${duration.toMillis()}ms'")

        fun setStatementTimeout(duration: Duration) =
            handle.execute("SET LOCAL statement_timeout = '${duration.toMillis()}ms'")
    }

    /**
     * A single database connection running a transaction.
     *
     * Tied to the thread that created it, and throws `IllegalStateException` if used in the wrong
     * thread.
     */
    class Transaction internal constructor(handle: Handle, private val hooks: TransactionHooks) :
        Read(handle) {
        private var savepointId: Long = 0

        fun nextSavepoint(): String = "savepoint-${savepointId++}"

        fun createUpdate(@Language("sql") sql: String): Update = Update(handle.createUpdate(sql))

        fun <Tag> createUpdate(f: QuerySql.Builder<Tag>.() -> QuerySql<Tag>): Update =
            createUpdate(QuerySql.Builder<Tag>().run { f(this) })

        fun createUpdate(fragment: QuerySql<*>): Update {
            val raw = handle.createUpdate(fragment.sql.toString())
            for ((idx, binding) in fragment.bindings.withIndex()) {
                raw.bindByType(idx, binding.value, binding.type)
            }
            return Update(raw)
        }

        fun prepareBatch(@Language("sql") sql: String): PreparedBatch =
            PreparedBatch(handle.prepareBatch(sql))

        fun execute(@Language("sql") sql: String, vararg args: Any): Int =
            handle.execute(sql, *args)

        /**
         * Registers a function to be called after this transaction has been committed successfully.
         *
         * If the exactly same function (= object instance) has already been registered, this is a
         * no-op.
         */
        fun afterCommit(f: () -> Unit) {
            hooks.afterCommit += f
        }

        fun <T> subTransaction(f: () -> T): T {
            val savepointName = nextSavepoint()
            handle.savepoint(savepointName)
            val result =
                try {
                    f()
                } catch (e: Throwable) {
                    try {
                        handle.rollbackToSavepoint(savepointName)
                    } catch (rollback: Exception) {
                        e.addSuppressed(rollback)
                    }
                    throw e
                }
            handle.releaseSavepoint(savepointName)
            return result
        }

        companion object {
            /**
             * Wraps an existing raw JDBI handle into a `Transaction` object.
             *
             * This is mostly intended for tests where the main API can't be used. Use *very*
             * sparingly!
             */
            fun wrap(handle: Handle): Transaction {
                check(handle.isInTransaction) { "Wrapped handle must have an active transaction" }
                check(!handle.isReadOnly) { "Wrapped handle must not be read-only" }
                return Transaction(handle, TransactionHooks())
            }
        }
    }

    abstract class SqlStatement<This : SqlStatement<This>> {
        protected abstract fun self(): This

        protected abstract val raw: org.jdbi.v3.core.statement.SqlStatement<*>

        inline fun <reified T> bind(
            name: String,
            value: T,
        ): This = bindByType(name, value, createQualifiedType(*defaultQualifiers<T>()))

        inline fun <reified T> registerColumnMapper(mapper: ColumnMapper<T>): This =
            registerColumnMapper(createQualifiedType(), mapper)

        fun <T> registerColumnMapper(type: QualifiedType<T>, mapper: ColumnMapper<T>): This {
            raw.registerColumnMapper(type, mapper)
            return self()
        }

        fun addBinding(binding: Binding<*>): This {
            raw.bindByType(binding.name, binding.value, binding.type)
            return self()
        }

        fun addBindings(bindings: Iterable<Binding<*>>): This {
            for (binding in bindings) {
                raw.bindByType(binding.name, binding.value, binding.type)
            }
            return self()
        }

        fun addBindings(bindings: Sequence<Binding<*>>): This {
            for (binding in bindings) {
                raw.bindByType(binding.name, binding.value, binding.type)
            }
            return self()
        }

        fun bindJson(name: String, value: Any): This =
            bindByType(
                name,
                value,
                QualifiedType.of(value.javaClass).withAnnotationClasses(listOf(Json::class.java))
            )

        fun <T> bindByType(name: String, value: T, type: QualifiedType<T>): This {
            raw.bindByType(name, value, type)
            return self()
        }

        fun bindKotlin(value: Any): This {
            raw.bindKotlin(value)
            return self()
        }

        fun bindKotlin(name: String, value: Any): This {
            raw.bindKotlin(name, value)
            return self()
        }
    }

    class Query internal constructor(override val raw: org.jdbi.v3.core.statement.Query) :
        SqlStatement<Query>(), ResultBearing {
        override fun self(): Query = this

        fun setFetchSize(fetchSize: Int): Query = this.also { raw.setFetchSize(fetchSize) }

        /** Runs the query and maps the results automatically to a list */
        inline fun <reified T> toList(
            vararg qualifiers: KClass<out Annotation> = defaultQualifiers<T>()
        ): List<T> = mapTo(createQualifiedType<T>(*qualifiers)).toList()

        /** Runs the query and maps the results automatically to a set */
        inline fun <reified T> toSet(
            vararg qualifiers: KClass<out Annotation> = defaultQualifiers<T>()
        ): Set<T> = mapTo(createQualifiedType<T>(*qualifiers)).toSet()

        /** Runs the query, checks that it returns exactly one row, and maps it automatically */
        inline fun <reified T> exactlyOne(
            vararg qualifiers: KClass<out Annotation> = defaultQualifiers<T>()
        ): T = mapTo(createQualifiedType<T>(*qualifiers)).exactlyOne()

        /**
         * Runs the query, checks that it returns at most one row, and maps it automatically if it
         * exists
         */
        inline fun <reified T> exactlyOneOrNull(
            vararg qualifiers: KClass<out Annotation> = defaultQualifiers<T>()
        ): T? = mapTo(createQualifiedType<T>(*qualifiers)).exactlyOneOrNull()

        inline fun <reified T> mapTo(
            qualifiers: Array<KClass<out Annotation>> = defaultQualifiers<T>()
        ): Result<T> = mapTo(createQualifiedType(*qualifiers))

        override fun <T> mapTo(type: QualifiedType<T>): Result<T> = Result(raw.mapTo(type))

        override fun <T> map(mapper: ColumnMapper<T>): Result<T> = Result(raw.map(mapper))

        override fun <T> map(mapper: RowViewMapper<T>): Result<T> = Result(raw.map(mapper))

        override fun <T> map(mapper: Row.() -> T): Result<T> =
            Result(raw.map { row -> mapper(Row(row)) })
    }

    @JvmInline
    value class Result<T> internal constructor(private val inner: ResultIterable<T>) {
        fun <R> useIterable(f: (Iterable<T>) -> R): R = inner.iterator().use { f(Iterable { it }) }

        fun toList(): List<T> = useIterable { it.toList() }

        fun toSet(): Set<T> = useIterable { it.toSet() }

        fun exactlyOne(): T =
            inner.iterator().use {
                if (!it.hasNext()) error("Expected exactly one result, got none")
                val result = it.next()
                if (it.hasNext()) error("Expected exactly one result, got more than one")
                result
            }

        fun exactlyOneOrNull(): T? =
            inner.iterator().use {
                if (!it.hasNext()) null
                else {
                    val result = it.next()
                    if (it.hasNext()) error("Expected 0-1 results, got more than one")
                    result
                }
            }

        // legacy functions

        @Deprecated("Use either toList or useIterable and call map on it instead")
        fun <R> map(f: (T) -> R): List<R> = useIterable { it.map(f) }

        @Deprecated("Use either toList or useIterable and map it instead")
        fun <R> mapNotNull(f: (T) -> R?): List<R> = useIterable { it.mapNotNull(f) }

        @Deprecated(
            "Use exactlyOne/exactlyOneOrNull if you expect only one result. If you *really* want to fetch N rows and throw away N-1, use useIterable instead"
        )
        fun first() = inner.first()

        @Deprecated(
            "Use exactlyOneOrNull if you expect only one result. If you *really* want to fetch N rows and throw away N-1, use useIterable instead"
        )
        fun firstOrNull(): T? = useIterable { it.firstOrNull() }

        @Deprecated("Use useIterable instead") fun asSequence(): Sequence<T> = inner.asSequence()

        @Deprecated("Use toList instead", ReplaceWith("toList()")) fun list(): List<T> = toList()

        @Deprecated("Use toSet instead", ReplaceWith("toSet()")) fun set(): Set<T> = toSet()

        @Deprecated("Use exactlyOne instead", ReplaceWith("exactlyOne()"))
        fun one(): T = exactlyOne()

        @Deprecated("Use exactlyOne instead", ReplaceWith("exactlyOne()"))
        fun single(): T = exactlyOne()

        @Deprecated(
            "Use exactlyOneOrNull if you expect 0-1 results. If you really want to map >1 counts to null, use useIterable instead"
        )
        fun singleOrNull(): T? = useIterable { it.singleOrNull() }

        @Deprecated("Use exactlyOneOrNull instead") fun findOne(): Optional<T> = inner.findOne()

        @Deprecated("Use SELECT EXISTS + exactlyOne instead")
        fun any(): Boolean = useIterable { it.any() }

        @Deprecated("Use either toList or useIterable and call all on it instead")
        inline fun all(crossinline predicate: (T) -> Boolean): Boolean = useIterable {
            it.all(predicate)
        }

        @Deprecated("Use either toList or useIterable and call forEach on it instead")
        inline fun forEach(crossinline action: (T) -> Unit) = useIterable { it.forEach(action) }

        @Deprecated("Use either toList or useIterable and call flatMap it instead")
        fun <R> flatMap(transform: (T) -> Iterable<R>): List<R> = useIterable {
            it.flatMap(transform)
        }

        @Deprecated("Use either toList or useIterable and call associate on it instead")
        inline fun <K, V> associate(crossinline transform: (T) -> Pair<K, V>): Map<K, V> =
            useIterable {
                it.associate(transform)
            }

        @Deprecated("Use either toList or useIterable and call associateBy on it instead")
        inline fun <K> associateBy(crossinline keySelector: (T) -> K): Map<K, T> = useIterable {
            it.associateBy(keySelector)
        }

        @Deprecated("Use either toList or useIterable and call associateBy on it instead")
        inline fun <K, V> associateBy(
            crossinline keySelector: (T) -> K,
            crossinline valueTransform: (T) -> V
        ): Map<K, V> = useIterable { it.associateBy(keySelector, valueTransform) }

        @Deprecated("Use either toList or useIterable and call associateByTo on it instead")
        inline fun <K, V, M : MutableMap<in K, in V>> associateByTo(
            destination: M,
            crossinline keySelector: (T) -> K,
            crossinline valueTransform: (T) -> V
        ): M = useIterable { it.associateByTo(destination, keySelector, valueTransform) }

        @Deprecated("Use either toList or useIterable and call groupBy on it instead")
        inline fun <K> groupBy(crossinline f: (T) -> K): Map<K, List<T>> = useIterable {
            it.groupBy(f)
        }

        @Deprecated("Use either toList or useIterable and call groupBy on it instead")
        inline fun <K, V> groupBy(
            crossinline keySelector: (T) -> K,
            crossinline valueTransform: (T) -> V
        ): Map<K, List<V>> = useIterable { it.groupBy(keySelector, valueTransform) }

        @Deprecated("Use either toList or useIterable and call fold on it instead")
        inline fun <R> fold(initial: R, crossinline operation: (acc: R, T) -> R): R = useIterable {
            it.fold(initial, operation)
        }

        @Deprecated("Use either toList or useIterable and call partition on it instead")
        inline fun partition(crossinline predicate: (T) -> Boolean): Pair<List<T>, List<T>> =
            useIterable {
                it.partition(predicate)
            }

        @Deprecated("Use either toList or useIterable and call sortedBy on it instead")
        inline fun <R : Comparable<R>> sortedBy(crossinline selector: (T) -> R?): List<T> =
            useIterable {
                it.sortedBy(selector)
            }

        @Deprecated("Use either toList or useIterable and call shuffled on it instead")
        fun shuffled(): List<T> = useIterable { it.shuffled() }
    }

    class Update internal constructor(override val raw: org.jdbi.v3.core.statement.Update) :
        SqlStatement<Update>() {
        override fun self(): Update = this

        fun execute() = raw.execute()

        fun executeAndReturnGeneratedKeys(): UpdateResult =
            UpdateResult(raw.executeAndReturnGeneratedKeys())

        fun updateExactlyOne(
            notFoundMsg: String = "Not found",
            foundMultipleMsg: String = "Found multiple"
        ) {
            val rows = this.execute()
            if (rows == 0) throw NotFound(notFoundMsg)
            if (rows > 1) throw Error(foundMultipleMsg)
        }

        fun updateNoneOrOne(foundMultipleMsg: String = "Found multiple"): Int {
            val rows = this.execute()
            if (rows > 1) throw Error(foundMultipleMsg)
            return rows
        }
    }

    class PreparedBatch
    internal constructor(override val raw: org.jdbi.v3.core.statement.PreparedBatch) :
        SqlStatement<PreparedBatch>() {
        override fun self(): PreparedBatch = this

        fun add(): PreparedBatch {
            raw.add()
            return this
        }

        fun execute(): IntArray = raw.execute()

        fun executeAndReturn(): UpdateResult = UpdateResult(raw.executePreparedBatch())
    }

    @JvmInline
    value class UpdateResult(private val raw: org.jdbi.v3.core.result.ResultBearing) :
        ResultBearing {
        /** Runs the query and maps the results automatically to a list */
        inline fun <reified T : Any> toList(
            vararg qualifiers: KClass<out Annotation> = defaultQualifiers<T>()
        ): List<T> = mapTo(createQualifiedType<T>(*qualifiers)).toList()

        /** Runs the query and maps the results automatically to a set */
        inline fun <reified T : Any> toSet(
            vararg qualifiers: KClass<out Annotation> = defaultQualifiers<T>()
        ): Set<T> = mapTo(createQualifiedType<T>(*qualifiers)).toSet()

        /** Runs the query, checks that it returns exactly one row, and maps it automatically */
        inline fun <reified T : Any> exactlyOne(
            vararg qualifiers: KClass<out Annotation> = defaultQualifiers<T>()
        ): T = mapTo(createQualifiedType<T>(*qualifiers)).exactlyOne()

        /**
         * Runs the query, checks that it returns at most one row, and maps it automatically if it
         * exists
         */
        inline fun <reified T : Any> exactlyOneOrNull(
            vararg qualifiers: KClass<out Annotation> = defaultQualifiers<T>()
        ): T? = mapTo(createQualifiedType<T>(*qualifiers)).exactlyOneOrNull()

        inline fun <reified T> mapTo(
            qualifiers: Array<out KClass<out Annotation>> = defaultQualifiers<T>()
        ): Result<T> = mapTo(createQualifiedType(*qualifiers))

        override fun <T> mapTo(type: QualifiedType<T>): Result<T> = Result(raw.mapTo(type))

        override fun <T> map(mapper: ColumnMapper<T>): Result<T> = Result(raw.map(mapper))

        override fun <T> map(mapper: RowViewMapper<T>): Result<T> = Result(raw.map(mapper))

        override fun <T> map(mapper: Row.() -> T): Result<T> =
            Result(raw.map { row -> mapper(Row(row)) })
    }

    interface ResultBearing {
        fun <T> mapTo(type: QualifiedType<T>): Result<T>

        fun <T> map(mapper: ColumnMapper<T>): Result<T>

        fun <T> map(mapper: RowViewMapper<T>): Result<T>

        fun <T> map(mapper: Row.() -> T): Result<T>

        /** Runs the query and maps the results to a list using the given mapper */
        fun <T> toList(mapper: Row.() -> T): List<T> = map(mapper).toList()

        /** Runs the query and maps the results to a set using the given mapper */
        fun <T> toSet(mapper: Row.() -> T): Set<T> = map(mapper).toSet()

        /** Runs the query and maps the results to a map using the given mapper */
        fun <K, V> toMap(mapper: Row.() -> Pair<K, V>): Map<K, V> =
            map(mapper).useIterable { it.toMap() }

        /**
         * Runs the query, checks that it returns exactly one row, and maps it using the given
         * mapper
         */
        fun <T> exactlyOne(mapper: Row.() -> T): T = map(mapper).exactlyOne()

        /**
         * Runs the query, checks that it returns at most one row, and maps it using the given
         * mapper if it exists
         */
        fun <T> exactlyOneOrNull(mapper: Row.() -> T): T? = map(mapper).exactlyOneOrNull()
    }
}

internal data class TransactionHooks(val afterCommit: LinkedHashSet<() -> Unit> = LinkedHashSet())

internal data class ThreadId(val id: Long = Thread.currentThread().id) {
    fun assertCurrentThread() =
        assert(Thread.currentThread().id == id) { "Database accessed from the wrong thread" }
}

data class Binding<T>(val name: String, val value: T, val type: QualifiedType<T>) {
    companion object {
        inline fun <reified T> of(
            name: String,
            value: T,
            qualifiers: Array<out KClass<out Annotation>> = defaultQualifiers<T>()
        ) = Binding(name, value, createQualifiedType(*qualifiers))
    }
}

data class ValueBinding<T>(val value: T, val type: QualifiedType<T>) {
    companion object {
        inline fun <reified T> of(
            value: T,
            qualifiers: Array<out KClass<out Annotation>> = defaultQualifiers<T>()
        ) = ValueBinding(value, createQualifiedType(*qualifiers))
    }
}

@JvmInline
value class QuerySqlString(@Language("sql") private val sql: String) {
    override fun toString(): String = sql
}

@JvmInline
value class PredicateSqlString(@Language("sql", prefix = "WHERE ") private val sql: String) {
    override fun toString(): String = sql
}

open class SqlBuilder {
    protected var bindings: List<ValueBinding<out Any?>> = listOf()

    inline fun <reified T> bind(value: T): Binding =
        bind(ValueBinding.of(value, defaultQualifiers<T>()))

    fun bindJson(value: Any): Binding =
        bind(
            ValueBinding(
                value,
                QualifiedType.of(value.javaClass).withAnnotationClasses(listOf(Json::class.java))
            )
        )

    fun <T> bind(binding: ValueBinding<T>): Binding {
        this.bindings += binding
        return Binding
    }

    fun <Sub> subquery(f: QuerySql.Builder<Sub>.() -> QuerySql<Sub>): QuerySqlString =
        subquery(QuerySql.of { f() })

    fun <Sub> subquery(fragment: QuerySql<Sub>): QuerySqlString {
        this.bindings += fragment.bindings
        return fragment.sql
    }

    fun predicate(predicate: PredicateSql<*>): PredicateSqlString {
        this.bindings += predicate.bindings
        return PredicateSqlString("(${predicate.sql})")
    }

    /** A marker type used for bound parameters that can be used in a template string */
    object Binding {
        override fun toString(): String = "?"
    }
}

/**
 * A builder for SQL, including bound parameter values.
 *
 * This is *very dynamic* and has almost no compile-time checks, but the phantom type parameter
 * `Tag` can be used to assign some type to a query for documentation purpose and to prevent mixing
 * different types of queries.
 */
data class QuerySql<@Suppress("unused") in Tag>(
    val sql: QuerySqlString,
    val bindings: List<ValueBinding<out Any?>>
) {
    companion object {
        fun <Tag> of(f: Builder<Tag>.() -> QuerySql<Tag>): QuerySql<Tag> =
            Builder<Tag>().run { f(this) }
    }

    class Builder<Tag> : SqlBuilder() {
        private var used: Boolean = false

        fun sql(@Language("sql") sql: String): QuerySql<Tag> {
            check(!used) { "builder has already been used" }
            this.used = true
            return QuerySql(QuerySqlString(sql), bindings)
        }
    }
}

class Predicate<Tag>(val f: PredicateSql.Builder<Tag>.(tablePrefix: String) -> PredicateSql<Tag>) {
    fun forTable(tablePrefix: String): PredicateSql<Tag> =
        PredicateSql.Builder<Tag>().run { (f)(tablePrefix) }

    fun and(other: Predicate<Tag>): Predicate<Tag> = Predicate {
        where("${predicate(forTable(it))} AND ${predicate(other.forTable(it))}")
    }

    fun or(other: Predicate<Tag>): Predicate<Tag> = Predicate {
        where("${predicate(forTable(it))} OR ${predicate(other.forTable(it))}")
    }

    companion object {
        fun <Tag> alwaysTrue(): Predicate<Tag> = Predicate { where("TRUE") }

        fun <Tag> alwaysFalse(): Predicate<Tag> = Predicate { where("FALSE") }

        fun <Tag> all(predicates: Iterable<Predicate<Tag>>): Predicate<Tag> = Predicate { table ->
            val sqlPredicates = predicates.map { predicate(it.forTable(table)) }
            where(if (sqlPredicates.isEmpty()) "TRUE" else sqlPredicates.joinToString(" AND "))
        }

        fun <Tag> any(predicates: Iterable<Predicate<Tag>>): Predicate<Tag> = Predicate { table ->
            val sqlPredicates = predicates.map { predicate(it.forTable(table)) }
            where(if (sqlPredicates.isEmpty()) "FALSE" else sqlPredicates.joinToString(" OR "))
        }
    }
}

class PredicateSql<@Suppress("unused") in Tag>(
    val sql: PredicateSqlString,
    val bindings: List<ValueBinding<out Any?>>
) {
    class Builder<Tag> : SqlBuilder() {
        private var used: Boolean = false

        fun where(@Language("sql", prefix = "WHERE ") sql: String): PredicateSql<Tag> {
            check(!used) { "builder has already been used" }
            this.used = true
            return PredicateSql(PredicateSqlString(sql), bindings)
        }
    }
}

@JvmInline
value class Row(private val row: RowView) {
    inline fun <reified K, reified V> columnPair(
        firstColumn: String,
        secondColumn: String
    ): Pair<K, V> = column<K>(firstColumn) to column<V>(secondColumn)

    inline fun <reified T> column(name: String, vararg annotations: KClass<out Annotation>): T {
        val type = createQualifiedType<T>(*annotations)
        val value = column(name, type)
        if (null !is T && value == null) {
            error("Non-nullable column $name was null")
        }
        return value
    }

    fun <T> column(name: String, type: QualifiedType<T>): T = row.getColumn(name, type)

    inline fun <reified T> jsonColumn(name: String): T = column(name, Json::class)

    inline fun <reified T> row(): T = row(typeOf<T>()) as T

    fun row(type: KType): Any? = row.getRow(type.asJdbiJavaType())
}
