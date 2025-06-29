// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.reports

import com.github.kittinunf.fuel.core.Request
import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.shared.EmployeeId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.auth.asUser
import fi.espoo.evaka.shared.dev.DevPersonType
import fi.espoo.evaka.shared.dev.DevPlacement
import fi.espoo.evaka.shared.dev.insert
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.testArea
import fi.espoo.evaka.testChild_1
import fi.espoo.evaka.testDaycare
import fi.espoo.evaka.withMockedTime
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import kotlin.test.assertEquals
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test

class ReportSmokeTests : FullApplicationTest(resetDbBeforeEach = false) {
    private val testUser =
        AuthenticatedUser.Employee(EmployeeId(UUID.randomUUID()), setOf(UserRole.ADMIN))

    @BeforeAll
    override fun beforeAll() {
        super.beforeAll()
        db.transaction { tx ->
            tx.insert(testArea)
            tx.insert(testDaycare)
            tx.insert(testChild_1, DevPersonType.CHILD)
        }
    }

    @Test
    fun `applications report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/applications",
                listOf("from" to "2020-05-01", "to" to "2020-08-01"),
            )
        )
    }

    @Test
    fun `assistance needs and actions report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/assistance-needs-and-actions",
                listOf("date" to "2020-08-01"),
            )
        )
    }

    @Test
    fun `child-age-language report returns http 200`() {
        assertOkResponse(
            http.get("/employee/reports/child-age-language", listOf("date" to "2020-08-01"))
        )
    }

    @Test
    fun `children-in-different-address report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/children-in-different-address",
                listOf("date" to "2020-08-01"),
            )
        )
    }

    @Test
    fun `decisions report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/decisions",
                listOf("from" to "2020-05-01", "to" to "2020-08-01"),
            )
        )

        assertOkResponse(
            http.get(
                "/employee/reports/decisions",
                listOf("from" to "2020-05-01", "to" to "2020-08-01", "applicationType" to "DAYCARE"),
            )
        )
    }

    @Test
    fun `duplicate-people report returns http 200`() {
        assertOkResponse(http.get("/employee/reports/duplicate-people"))
    }

    @Test
    fun `ended-placements report returns http 200`() {
        assertOkResponse(
            http.get("/employee/reports/ended-placements", listOf("year" to 2020, "month" to 1))
        )
    }

    @Test
    fun `family-conflicts report returns http 200`() {
        assertOkResponse(http.get("/employee/reports/family-conflicts"))
    }

    @Test
    fun `family-contacts report returns http 200`() {
        db.transaction {
            it.insert(
                DevPlacement(
                    childId = testChild_1.id,
                    unitId = testDaycare.id,
                    startDate = LocalDate.of(2022, 1, 1),
                    endDate = LocalDate.of(2022, 3, 1),
                )
            )
        }
        val now = HelsinkiDateTime.of(LocalDate.of(2022, 2, 1), LocalTime.of(12, 0))
        assertOkResponse(
            http
                .get(
                    "/employee/reports/family-contacts?unitId=${testDaycare.id}&date=${now.toLocalDate()}"
                )
                .withMockedTime(now)
        )
    }

    @Test
    fun `invoice report returns http 200`() {
        assertOkResponse(http.get("/employee/reports/invoices", listOf("yearMonth" to "2020-08")))
    }

    @Test
    fun `missing-head-of-family report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/missing-head-of-family",
                listOf("from" to "2020-05-01", "to" to "2020-08-01"),
            )
        )
    }

    @Test
    fun `missing-service-need report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/missing-service-need",
                listOf("from" to "2020-05-01", "to" to "2020-08-01"),
            )
        )
    }

    @Test
    fun `occupancy-by-unit report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/occupancy-by-unit",
                listOf(
                    "type" to "PLANNED",
                    "careAreaId" to testArea.id,
                    "year" to 2020,
                    "month" to 1,
                ),
            )
        )

        assertOkResponse(
            http.get(
                "/employee/reports/occupancy-by-unit",
                listOf(
                    "type" to "CONFIRMED",
                    "careAreaId" to testArea.id,
                    "year" to 2020,
                    "month" to 1,
                ),
            )
        )

        assertOkResponse(
            http.get(
                "/employee/reports/occupancy-by-unit",
                listOf(
                    "type" to "REALIZED",
                    "careAreaId" to testArea.id,
                    "year" to 2020,
                    "month" to 1,
                ),
            )
        )
    }

    @Test
    fun `occupancy-by-group report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/occupancy-by-group",
                listOf(
                    "type" to "CONFIRMED",
                    "careAreaId" to testArea.id,
                    "year" to 2020,
                    "month" to 1,
                ),
            )
        )

        assertOkResponse(
            http.get(
                "/employee/reports/occupancy-by-group",
                listOf(
                    "type" to "REALIZED",
                    "careAreaId" to testArea.id,
                    "year" to 2020,
                    "month" to 1,
                ),
            )
        )
    }

    @Test
    fun `partners-in-different-address report returns http 200`() {
        assertOkResponse(http.get("/employee/reports/partners-in-different-address"))
    }

    @Test
    fun `presences report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/presences",
                listOf("from" to "2020-05-01", "to" to "2020-05-02"),
            )
        )
    }

    @Test
    fun `raw report returns http 200`() {
        assertOkResponse(
            http.get("/employee/reports/raw", listOf("from" to "2020-05-01", "to" to "2020-05-02"))
        )
    }

    @Test
    fun `service-need report returns http 200`() {
        assertOkResponse(http.get("/employee/reports/service-need", listOf("date" to "2020-08-01")))
    }

    @Test
    fun `starting-placements report returns http 200`() {
        assertOkResponse(
            http.get("/employee/reports/starting-placements", listOf("year" to 2020, "month" to 1))
        )
    }

    @Test
    fun `placement sketching report returns http 200`() {
        assertOkResponse(
            http.get(
                "/employee/reports/placement-sketching",
                listOf(
                    "placementStartDate" to "2021-01-01",
                    "earliestPreferredStartDate" to "2021-08-13",
                ),
            )
        )
    }

    @Test
    fun `varda error reports return http 200`() {
        assertOkResponse(http.get("/employee/reports/varda-child-errors"))
        assertOkResponse(http.get("/employee/reports/varda-unit-errors"))
    }

    @Test
    fun `units report returns http 200`() {
        assertOkResponse(http.get("/employee/reports/units"))
    }

    private fun assertOkResponse(req: Request) {
        val (_, response, _) = req.asUser(testUser).response()
        assertEquals(200, response.statusCode)
    }
}
