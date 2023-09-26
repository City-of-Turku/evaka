// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.attendance

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.daycare.service.AbsenceCategory
import fi.espoo.evaka.daycare.service.AbsenceType
import fi.espoo.evaka.insertGeneralTestFixtures
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.shared.GroupId
import fi.espoo.evaka.shared.MobileDeviceId
import fi.espoo.evaka.shared.PlacementId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.dev.DevDaycareGroup
import fi.espoo.evaka.shared.dev.createMobileDeviceToUnit
import fi.espoo.evaka.shared.dev.insertTestAbsence
import fi.espoo.evaka.shared.dev.insertTestChildAttendance
import fi.espoo.evaka.shared.dev.insertTestDaycareGroup
import fi.espoo.evaka.shared.dev.insertTestDaycareGroupPlacement
import fi.espoo.evaka.shared.dev.insertTestPlacement
import fi.espoo.evaka.shared.domain.BadRequest
import fi.espoo.evaka.shared.domain.Conflict
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.domain.RealEvakaClock
import fi.espoo.evaka.shared.domain.europeHelsinki
import fi.espoo.evaka.testChild_1
import fi.espoo.evaka.testDaycare
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired

class AttendanceTransitionsIntegrationTest : FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired private lateinit var childAttendanceController: ChildAttendanceController

    private val mobileUser = AuthenticatedUser.MobileDevice(MobileDeviceId(UUID.randomUUID()))
    private val groupId = GroupId(UUID.randomUUID())
    private val groupName = "Testaajat"
    private val daycarePlacementId = PlacementId(UUID.randomUUID())
    private val placementStart = LocalDate.now().minusDays(30)
    private val placementEnd = LocalDate.now().plusDays(30)

    @BeforeEach
    fun beforeEach() {
        db.transaction { tx ->
            tx.insertGeneralTestFixtures()
            tx.insertTestDaycareGroup(
                DevDaycareGroup(id = groupId, daycareId = testDaycare.id, name = groupName)
            )
            tx.createMobileDeviceToUnit(mobileUser.id, testDaycare.id)
        }
    }

    @Test
    fun `post child arrives - happy case`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildComing()

        val arrived = roundedTimeNow()
        markArrived(arrived)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.PRESENT, child.status)
        assertNotNull(child.attendances)
        assertEquals(arrived, child.attendances[0].arrived.toLocalTime().withSecond(0).withNano(0))
        assertNull(child.attendances[0].departed)
        assertTrue(child.absences.isEmpty())
    }

    @Test
    fun `post child arrives - arriving twice is error`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent()

        val arrived = roundedTimeNow()
        assertThrows<Conflict> { markArrived(arrived) }
    }

    @Test
    fun `post return to coming - happy case when present`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent()

        returnToComing()
        expectNoAttendanceStatuses()
    }

    @Test
    fun `post return to coming - happy case when absent`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildAbsent(
            AbsenceType.UNKNOWN_ABSENCE,
            AbsenceCategory.BILLABLE,
            AbsenceCategory.NONBILLABLE
        )

        returnToComing()
        expectNoAttendanceStatuses()
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from preschool start`() {
        val arrived = LocalTime.of(9, 0)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(10, 0)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(13, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from preschool end`() {
        val arrived = LocalTime.of(13, 0)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59))),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present hour before preschool start`() {
        val arrived = LocalTime.of(8, 0)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(10, 0))),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1230`() {
        val arrived = LocalTime.of(12, 30)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(13, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 0850`() {
        val arrived = LocalTime.of(8, 50)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(10, 0)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(13, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1159`() {
        val arrived = LocalTime.of(11, 59)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(12, 59)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(13, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1200`() {
        val arrived = LocalTime.of(12, 0)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(13, 0)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(13, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1201`() {
        val arrived = LocalTime.of(12, 1)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(13, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1244`() {
        val arrived = LocalTime.of(12, 44)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(13, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1245`() {
        val arrived = LocalTime.of(12, 45)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(13, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1246`() {
        val arrived = LocalTime.of(12, 46)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59))),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1314`() {
        val arrived = LocalTime.of(13, 14)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59))),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1315`() {
        val arrived = LocalTime.of(13, 15)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59))),
            info
        )
    }

    @Test
    fun `get child departure info - preschool daycare placement and present from 1316`() {
        val arrived = LocalTime.of(13, 16)
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59))),
            info
        )
    }

    @Test
    fun `get child departure info - preparatory daycare placement and present from 8`() {
        val arrived = LocalTime.of(8, 0)
        givenChildPlacement(PlacementType.PREPARATORY_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(10, 0))),
            info
        )
    }

    @Test
    fun `get child departure info - preparatory daycare placement and present from 9`() {
        val arrived = LocalTime.of(9, 0)
        givenChildPlacement(PlacementType.PREPARATORY_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(10, 0)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(14, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preparatory daycare placement and present from 1330`() {
        val arrived = LocalTime.of(13, 30)
        givenChildPlacement(PlacementType.PREPARATORY_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(23, 59)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(14, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - preparatory daycare placement and present from 0850`() {
        val arrived = LocalTime.of(8, 50)
        givenChildPlacement(PlacementType.PREPARATORY_DAYCARE)
        givenChildPresent(arrived)

        val info = getDepartureInfo()
        assertEquals(
            listOf(
                AbsenceThreshold(AbsenceCategory.NONBILLABLE, LocalTime.of(10, 0)),
                AbsenceThreshold(AbsenceCategory.BILLABLE, LocalTime.of(14, 15))
            ),
            info
        )
    }

    @Test
    fun `get child departure info - not yet present`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildComing()
        assertEquals(emptyList(), getDepartureInfo())
    }

    @Test
    fun `get child departure info - already departed`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildDeparted()
        assertEquals(emptyList(), getDepartureInfo())
    }

    @Test
    fun `post child departs - happy case`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(LocalTime.of(8, 0))

        val departed = LocalTime.of(16, 0)
        markDeparted(departed, absenceType = null)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.DEPARTED, child.status)
        assertNotNull(child.attendances)
        assertEquals(
            departed,
            child.attendances[0].departed?.toLocalTime()?.withSecond(0)?.withNano(0)
        )
        assertTrue(child.absences.isEmpty())
    }

    @Test
    fun `post child departs - absent from preschool_daycare`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(LocalTime.of(9, 0))

        val departed = LocalTime.of(13, 0)
        val absenceType = AbsenceType.OTHER_ABSENCE
        markDeparted(departed, absenceType)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.DEPARTED, child.status)
        assertNotNull(child.attendances)
        assertEquals(
            departed,
            child.attendances[0].departed?.toLocalTime()?.withSecond(0)?.withNano(0)
        )
        assertContentEquals(listOf(AbsenceCategory.BILLABLE), child.absences.map { it.category })
    }

    @Test
    fun `post child departs - absent from preschool`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(LocalTime.of(12, 45))

        val departed = LocalTime.of(18, 0)
        val absenceType = AbsenceType.UNKNOWN_ABSENCE
        markDeparted(departed, absenceType)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.DEPARTED, child.status)
        assertNotNull(child.attendances)
        assertEquals(
            departed,
            child.attendances[0].departed?.toLocalTime()?.withSecond(0)?.withNano(0)
        )
        assertContentEquals(listOf(AbsenceCategory.NONBILLABLE), child.absences.map { it.category })
    }

    @Test
    fun `post child departs - absent from preschool and preschool_daycare`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildPresent(LocalTime.of(8, 50))

        val departed = LocalTime.of(9, 30)
        val absenceType = AbsenceType.SICKLEAVE
        markDeparted(departed, absenceType)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.DEPARTED, child.status)
        assertNotNull(child.attendances)
        assertEquals(
            departed,
            child.attendances[0].departed?.toLocalTime()?.withSecond(0)?.withNano(0)
        )
        assertEquals(
            setOf(AbsenceCategory.BILLABLE, AbsenceCategory.NONBILLABLE),
            child.absences.map { it.category }.toSet()
        )
    }

    @Test
    fun `post child departs - multi day attendance that ends at midnight`() {
        givenChildPlacement(PlacementType.DAYCARE)
        givenChildPresent(LocalTime.of(8, 50), LocalDate.now().minusDays(1))

        val departed = LocalTime.of(0, 0)
        markDeparted(departed, null)
        expectNoAttendanceStatuses()
    }

    @Test
    fun `post child departs - departing twice is error`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildDeparted()

        assertThrows<Conflict> { markDeparted(roundedTimeNow(), null) }
    }

    @Test
    fun `post return to present - happy case when departed`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildDeparted()

        returnToPresent()
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.PRESENT, child.status)
        assertNotNull(child.attendances)
        assertNotNull(child.attendances[0].arrived)
        assertNull(child.attendances[0].departed)
        assertTrue(child.absences.isEmpty())
    }

    @Test
    fun `post full day absence - happy case when coming to preschool`() {
        // previous day attendance should have no effect
        db.transaction {
            it.insertTestChildAttendance(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                arrived = HelsinkiDateTime.now().minusDays(1).minusHours(1),
                departed = HelsinkiDateTime.now().minusDays(1).minusMinutes(1)
            )
        }
        givenChildPlacement(PlacementType.PRESCHOOL)
        givenChildComing()

        markFullDayAbsence(AbsenceType.SICKLEAVE)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.ABSENT, child.status)
        assertContentEquals(listOf(AbsenceCategory.NONBILLABLE), child.absences.map { it.category })
    }

    @Test
    fun `post full day absence - happy case when coming to preschool_daycare`() {
        givenChildPlacement(PlacementType.PRESCHOOL_DAYCARE)
        givenChildComing()

        markFullDayAbsence(AbsenceType.SICKLEAVE)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.ABSENT, child.status)
        assertEquals(
            setOf(AbsenceCategory.BILLABLE, AbsenceCategory.NONBILLABLE),
            child.absences.map { it.category }.toSet()
        )
    }

    @Test
    fun `post full day absence - happy case when coming to preparatory`() {
        givenChildPlacement(PlacementType.PREPARATORY)
        givenChildComing()

        markFullDayAbsence(AbsenceType.SICKLEAVE)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.ABSENT, child.status)
        assertContentEquals(listOf(AbsenceCategory.NONBILLABLE), child.absences.map { it.category })
    }

    @Test
    fun `post full day absence - happy case when coming to preparatory_daycare`() {
        givenChildPlacement(PlacementType.PREPARATORY_DAYCARE)
        givenChildComing()

        markFullDayAbsence(AbsenceType.SICKLEAVE)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.ABSENT, child.status)
        assertEquals(
            setOf(AbsenceCategory.BILLABLE, AbsenceCategory.NONBILLABLE),
            child.absences.map { it.category }.toSet()
        )
    }

    @Test
    fun `post full day absence - happy case when coming to daycare`() {
        givenChildPlacement(PlacementType.DAYCARE)
        givenChildComing()

        markFullDayAbsence(AbsenceType.SICKLEAVE)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.ABSENT, child.status)
        assertContentEquals(listOf(AbsenceCategory.BILLABLE), child.absences.map { it.category })
    }

    @Test
    fun `post full day absence - happy case when coming to daycare_part_time`() {
        givenChildPlacement(PlacementType.DAYCARE_PART_TIME)
        givenChildComing()

        markFullDayAbsence(AbsenceType.SICKLEAVE)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.ABSENT, child.status)
        assertContentEquals(listOf(AbsenceCategory.BILLABLE), child.absences.map { it.category })
    }

    @Test
    fun `post full day absence - happy case when coming to club`() {
        givenChildPlacement(PlacementType.CLUB)
        givenChildComing()

        markFullDayAbsence(AbsenceType.SICKLEAVE)
        val child = expectOneAttendanceStatus()

        assertEquals(AttendanceStatus.ABSENT, child.status)
        assertContentEquals(listOf(AbsenceCategory.NONBILLABLE), child.absences.map { it.category })
    }

    @Test
    fun `post full day absence - error when no placement`() {
        assertThrows<BadRequest> { markFullDayAbsence(AbsenceType.SICKLEAVE) }
    }

    @Test
    fun `post full day absence - error when present`() {
        givenChildPlacement(PlacementType.PREPARATORY_DAYCARE)
        givenChildPresent()

        assertThrows<Conflict> { markFullDayAbsence(AbsenceType.SICKLEAVE) }
    }

    @Test
    fun `post full day absence - error when departed`() {
        givenChildPlacement(PlacementType.PREPARATORY_DAYCARE)
        givenChildDeparted()

        assertThrows<Conflict> { markFullDayAbsence(AbsenceType.SICKLEAVE) }
    }

    private fun givenChildPlacement(placementType: PlacementType) {
        db.transaction { tx ->
            tx.insertTestPlacement(
                id = daycarePlacementId,
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = placementStart,
                endDate = placementEnd,
                type = placementType
            )
            tx.insertTestDaycareGroupPlacement(
                daycarePlacementId = daycarePlacementId,
                groupId = groupId,
                startDate = placementStart,
                endDate = placementEnd
            )
        }
    }

    private fun givenChildComing() {
        val attendance = getAttendanceStatuses()
        if (attendance.isNotEmpty()) {
            assertEquals(1, attendance.size)
            assertEquals(AttendanceStatus.COMING, attendance.values.first().status)
        }
    }

    private fun givenChildPresent(
        arrived: LocalTime = roundedTimeNow().minusHours(1),
        date: LocalDate = LocalDate.now()
    ) {
        db.transaction {
            it.insertTestChildAttendance(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                arrived = HelsinkiDateTime.of(date, arrived),
                departed = null
            )
        }
        val child = expectOneAttendanceStatus()
        assertEquals(AttendanceStatus.PRESENT, child.status)
    }

    private fun givenChildDeparted(
        arrived: LocalTime = roundedTimeNow().minusHours(1),
        departed: LocalTime = roundedTimeNow().minusMinutes(10)
    ) {
        db.transaction {
            it.insertTestChildAttendance(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                arrived = HelsinkiDateTime.now().withTime(arrived),
                departed = HelsinkiDateTime.now().withTime(departed)
            )
        }
        val child = expectOneAttendanceStatus()
        assertEquals(AttendanceStatus.DEPARTED, child.status)
    }

    private fun givenChildAbsent(absenceType: AbsenceType, vararg categories: AbsenceCategory) {
        categories.forEach { category ->
            db.transaction {
                it.insertTestAbsence(
                    childId = testChild_1.id,
                    absenceType = absenceType,
                    category = category,
                    date = LocalDate.now()
                )
            }
        }
    }

    private fun getAttendanceStatuses() =
        childAttendanceController.getAttendanceStatuses(
            dbInstance(),
            mobileUser,
            RealEvakaClock(),
            testDaycare.id
        )

    private fun expectOneAttendanceStatus():
        ChildAttendanceController.ChildAttendanceStatusResponse {
        val attendances = getAttendanceStatuses()
        assertEquals(1, attendances.size)
        return attendances.values.first()
    }

    private fun expectNoAttendanceStatuses() {
        val attendances = getAttendanceStatuses()
        assertEquals(0, attendances.size)
    }

    private fun markArrived(arrived: LocalTime) {
        childAttendanceController.postArrival(
            dbInstance(),
            mobileUser,
            RealEvakaClock(),
            testDaycare.id,
            testChild_1.id,
            ChildAttendanceController.ArrivalRequest(arrived)
        )
    }

    private fun returnToComing() {
        childAttendanceController.returnToComing(
            dbInstance(),
            mobileUser,
            RealEvakaClock(),
            testDaycare.id,
            testChild_1.id
        )
    }

    private fun getDepartureInfo(): List<AbsenceThreshold> {
        return childAttendanceController.getChildDeparture(
            dbInstance(),
            mobileUser,
            RealEvakaClock(),
            testDaycare.id,
            testChild_1.id
        )
    }

    private fun markDeparted(departed: LocalTime, absenceType: AbsenceType?) {
        childAttendanceController.postDeparture(
            dbInstance(),
            mobileUser,
            RealEvakaClock(),
            testDaycare.id,
            testChild_1.id,
            ChildAttendanceController.DepartureRequest(departed, absenceType)
        )
    }

    private fun returnToPresent() {
        childAttendanceController.returnToPresent(
            dbInstance(),
            mobileUser,
            RealEvakaClock(),
            testDaycare.id,
            testChild_1.id
        )
    }

    private fun markFullDayAbsence(absenceType: AbsenceType) {
        childAttendanceController.postFullDayAbsence(
            dbInstance(),
            mobileUser,
            RealEvakaClock(),
            testDaycare.id,
            testChild_1.id,
            ChildAttendanceController.FullDayAbsenceRequest(absenceType)
        )
    }

    private fun roundedTimeNow() = LocalTime.now(europeHelsinki).withSecond(0).withNano(0)
}
