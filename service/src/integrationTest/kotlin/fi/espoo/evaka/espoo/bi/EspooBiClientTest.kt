// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.espoo.bi

import com.github.kittinunf.fuel.core.FuelManager
import fi.espoo.evaka.EspooBiEnv
import fi.espoo.evaka.PureJdbiTest
import fi.espoo.evaka.Sensitive
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.domain.MockEvakaClock
import io.javalin.security.BasicAuthCredentials
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach

class EspooBiClientTest : PureJdbiTest(resetDbBeforeEach = true) {
    private val credentials = BasicAuthCredentials(username = "user", password = "password")
    private val clock = MockEvakaClock(HelsinkiDateTime.of(LocalDateTime.of(2023, 1, 1, 1, 0)))
    private val fuel = FuelManager()
    private lateinit var server: MockBiServer
    private lateinit var client: EspooBiClient

    @BeforeAll
    fun beforeAll() {
        server = MockBiServer.start(credentials)
        client =
            EspooBiClient(
                fuel,
                EspooBiEnv(
                    url = "http://localhost:${server.port}",
                    username = credentials.username,
                    password = Sensitive(credentials.password)
                )
            )
    }

    @AfterAll
    fun afterAll() {
        server.close()
    }

    @BeforeEach
    fun beforeEach() {
        server.clearData()
    }

    @Test
    fun `BI client sends a stream successfully`() {
        val record = "line\n"
        val recordCount = 100_000
        client.sendBiTable(db, clock, "test") { _ -> generateSequence { record }.take(recordCount) }

        val request = server.getCapturedRequests().values.single()
        val expected = record.toByteArray(CSV_CHARSET)
        val chunks =
            request.body.asSequence().chunked(expected.size, List<Byte>::toByteArray).toList()
        assertEquals(recordCount, chunks.size)
        for (chunk in chunks) {
            assertContentEquals(expected, chunk)
        }
    }
}
