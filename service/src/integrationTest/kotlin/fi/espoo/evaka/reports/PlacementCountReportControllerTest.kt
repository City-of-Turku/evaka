// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.reports

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.daycare.CareType
import fi.espoo.evaka.daycare.domain.ProviderType
import fi.espoo.evaka.insertServiceNeedOptions
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.shared.EvakaUserId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.dev.DevCareArea
import fi.espoo.evaka.shared.dev.DevChild
import fi.espoo.evaka.shared.dev.DevDaycare
import fi.espoo.evaka.shared.dev.DevEmployee
import fi.espoo.evaka.shared.dev.DevPerson
import fi.espoo.evaka.shared.dev.insertTestCareArea
import fi.espoo.evaka.shared.dev.insertTestChild
import fi.espoo.evaka.shared.dev.insertTestDaycare
import fi.espoo.evaka.shared.dev.insertTestEmployee
import fi.espoo.evaka.shared.dev.insertTestPerson
import fi.espoo.evaka.shared.dev.insertTestPlacement
import fi.espoo.evaka.shared.dev.insertTestServiceNeed
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.domain.MockEvakaClock
import fi.espoo.evaka.snDefaultDaycare
import fi.espoo.evaka.snDefaultPreschool
import java.time.LocalDate
import java.time.LocalTime
import kotlin.test.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

internal class PlacementCountReportControllerTest : FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired private lateinit var placementCountReportController: PlacementCountReportController

    private val admin = DevEmployee(roles = setOf(UserRole.ADMIN))
    private val adminLoginUser = AuthenticatedUser.Employee(admin.id, admin.roles)

    @Test
    fun `Care type filter works`() {
        val mockToday =
            MockEvakaClock(HelsinkiDateTime.of(LocalDate.of(2022, 12, 8), LocalTime.of(12, 15)))
        db.transaction { tx ->
            tx.insertServiceNeedOptions()
            tx.insertTestEmployee(admin)
            val areaId = tx.insertTestCareArea(DevCareArea())
            val unitId =
                tx.insertTestDaycare(DevDaycare(areaId = areaId, openingDate = mockToday.today()))
            val preschoolChildId = tx.insertTestPerson(DevPerson())
            tx.insertTestChild(DevChild(id = preschoolChildId))
            val preschoolPlacementId =
                tx.insertTestPlacement(
                    childId = preschoolChildId,
                    unitId = unitId,
                    startDate = mockToday.today().minusMonths(1),
                    endDate = mockToday.today().plusMonths(1),
                    type = PlacementType.PRESCHOOL
                )
            tx.insertTestServiceNeed(
                confirmedBy = EvakaUserId(admin.id.raw),
                placementId = preschoolPlacementId,
                period =
                    FiniteDateRange(
                        mockToday.today().minusMonths(1),
                        mockToday.today().plusMonths(1)
                    ),
                optionId = snDefaultPreschool.id
            )

            val daycareU3yChildId = tx.insertTestPerson(DevPerson(
                    dateOfBirth = mockToday.today().minusYears(2)
            ))
            tx.insertTestChild(DevChild(id = daycareU3yChildId))
            val daycarePlacementId =
                    tx.insertTestPlacement(
                            childId = daycareU3yChildId,
                            unitId = unitId,
                            startDate = mockToday.today().minusMonths(1),
                            endDate = mockToday.today().plusMonths(1),
                            type = PlacementType.DAYCARE
                    )
            tx.insertTestServiceNeed(
                    confirmedBy = EvakaUserId(admin.id.raw),
                    placementId = daycarePlacementId,
                    period =
                    FiniteDateRange(
                            mockToday.today().minusMonths(1),
                            mockToday.today().plusMonths(1)
                    ),
                    optionId = snDefaultDaycare.id
            )
        }
        val reportAll =
            placementCountReportController.getPlacementCountReport(
                dbInstance(),
                adminLoginUser,
                mockToday,
                mockToday.today(),
                emptyList(),
                emptyList(),
            )
        assertEquals(2, reportAll.placementCount)
        assertEquals(1, reportAll.placementCount3vAndOver)
        assertEquals(1, reportAll.placementCountUnder3v)

        val reportPreschool =
                placementCountReportController.getPlacementCountReport(
                        dbInstance(),
                        adminLoginUser,
                        mockToday,
                        mockToday.today(),
                        emptyList(),
                        listOf(CareType.PRESCHOOL)
                )
        assertEquals(1, reportPreschool.placementCount)
        assertEquals(1, reportPreschool.placementCount3vAndOver)
        assertEquals(0, reportPreschool.placementCountUnder3v)
    }
}
