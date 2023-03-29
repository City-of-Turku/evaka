// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.reports

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.children.Group
import fi.espoo.evaka.daycare.service.AbsenceCategory
import fi.espoo.evaka.daycare.service.AbsenceType
import fi.espoo.evaka.insertGeneralTestFixtures
import fi.espoo.evaka.shared.GroupId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.dev.DevDailyServiceTimes
import fi.espoo.evaka.shared.dev.DevDaycareGroup
import fi.espoo.evaka.shared.dev.DevReservation
import fi.espoo.evaka.shared.dev.insertTestAbsence
import fi.espoo.evaka.shared.dev.insertTestBackUpCare
import fi.espoo.evaka.shared.dev.insertTestDailyServiceTimes
import fi.espoo.evaka.shared.dev.insertTestDaycareGroup
import fi.espoo.evaka.shared.dev.insertTestDaycareGroupPlacement
import fi.espoo.evaka.shared.dev.insertTestPlacement
import fi.espoo.evaka.shared.dev.insertTestReservation
import fi.espoo.evaka.shared.domain.DateRange
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.RealEvakaClock
import fi.espoo.evaka.testChild_1
import fi.espoo.evaka.testChild_2
import fi.espoo.evaka.testChild_3
import fi.espoo.evaka.testChild_4
import fi.espoo.evaka.testChild_5
import fi.espoo.evaka.testChild_6
import fi.espoo.evaka.testChild_7
import fi.espoo.evaka.testChild_8
import fi.espoo.evaka.testDaycare
import fi.espoo.evaka.testDaycare2
import fi.espoo.evaka.unitSupervisorOfTestDaycare
import java.time.LocalDate
import java.time.LocalTime
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.groups.Tuple
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

internal class AttendanceReservationReportByChildTest :
    FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired
    private lateinit var attendanceReservationReportController:
        AttendanceReservationReportController

    private val admin =
        AuthenticatedUser.Employee(unitSupervisorOfTestDaycare.id, setOf(UserRole.ADMIN))

    @BeforeEach
    fun setup() {
        db.transaction { tx -> tx.insertGeneralTestFixtures() }
    }

    @Test
    fun `returns only unit's operation days`() {
        val startDate = LocalDate.of(2022, 9, 1) // Thu
        val endDate = LocalDate.of(2022, 9, 6) // Tue
        db.transaction { tx ->
            tx.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = startDate,
                endDate = endDate
            )
            FiniteDateRange(startDate, endDate).dates().forEach { date ->
                tx.insertTestReservation(
                    DevReservation(
                        childId = testChild_1.id,
                        date = date,
                        startTime = LocalTime.of(8, 15),
                        endTime = LocalTime.of(15, 48),
                        createdBy = admin.evakaUserId
                    )
                )
            }
        }

        val result = getReport(startDate, endDate)
        assertThat(result)
            .extracting({ it.childId }, { it.date })
            .containsExactlyInAnyOrder(
                Tuple(testChild_1.id, LocalDate.of(2022, 9, 1)), // Thu
                Tuple(testChild_1.id, LocalDate.of(2022, 9, 2)), // Fri
                Tuple(testChild_1.id, LocalDate.of(2022, 9, 5)), // Mon
                Tuple(testChild_1.id, LocalDate.of(2022, 9, 6)) // Tue
            )
    }

    @Test
    fun `end date is inclusive`() {
        val date = LocalDate.of(2022, 9, 2)
        db.transaction { tx ->
            tx.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(15, 48),
                    createdBy = admin.evakaUserId
                )
            )
        }

        val result = getReport(date, date)
        assertThat(result)
            .extracting({ it.childId }, { it.date })
            .containsExactlyInAnyOrder(Tuple(testChild_1.id, LocalDate.of(2022, 9, 2)))
    }

    @Test
    fun `reservation with no times is ignored`() {
        val date = LocalDate.of(2022, 9, 2)
        db.transaction { tx ->
            tx.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = date,
                    startTime = null,
                    endTime = null,
                    createdBy = admin.evakaUserId
                )
            )
        }

        val result = getReport(date, date)
        assertThat(result)
            .extracting(
                { it.childId },
                { it.date },
                { it.reservationId },
                { it.reservationStartTime },
                { it.reservationEndTime }
            )
            .containsExactly(Tuple(testChild_1.id, LocalDate.of(2022, 9, 2), null, null, null))
    }

    @Test
    fun `child without placement is not included`() {
        val date = LocalDate.of(2020, 5, 28)
        db.transaction { tx ->
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(15, 48),
                    createdBy = admin.evakaUserId
                )
            )
        }

        val result = getReport(date, date)
        assertThat(result).isEmpty()
    }

    @Test
    fun `child with placement to a different unit is not included`() {
        val date = LocalDate.of(2020, 5, 28)
        db.transaction { tx ->
            tx.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare2.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(15, 48),
                    createdBy = admin.evakaUserId
                )
            )
        }

        val result = getReport(date, date)
        assertThat(result).isEmpty()
    }

    @Test
    fun `backup care is supported`() {
        val date = LocalDate.of(2020, 5, 28)
        db.transaction { tx ->
            val groupId =
                tx.insertTestDaycareGroup(
                    DevDaycareGroup(daycareId = testDaycare2.id, startDate = date, endDate = date)
                )
            tx.insertTestDaycareGroupPlacement(
                daycarePlacementId =
                    tx.insertTestPlacement(
                        childId = testChild_1.id,
                        unitId = testDaycare2.id,
                        startDate = date,
                        endDate = date
                    ),
                groupId = groupId,
                startDate = date,
                endDate = date
            )
            tx.insertTestBackUpCare(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(8, 16),
                    createdBy = admin.evakaUserId
                )
            )
            tx.insertTestPlacement(
                childId = testChild_2.id,
                unitId = testDaycare.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_2.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(8, 16),
                    createdBy = admin.evakaUserId
                )
            )
        }

        val result = getReport(date, date)
        assertThat(result)
            .extracting({ it.childId }, { it.date }, { it.isBackupCare })
            .containsExactlyInAnyOrder(
                Tuple(testChild_1.id, date, true),
                Tuple(testChild_2.id, date, false)
            )
    }

    @Test
    fun `multiple children is supported`() {
        val date = LocalDate.of(2020, 5, 28)
        db.transaction { tx ->
            listOf(
                    testChild_1,
                    testChild_2,
                    testChild_3,
                    testChild_4,
                    testChild_5,
                    testChild_6,
                    testChild_7,
                    testChild_8
                )
                .forEach { testChild ->
                    tx.insertTestPlacement(
                        childId = testChild.id,
                        unitId = testDaycare.id,
                        startDate = date,
                        endDate = date
                    )
                    tx.insertTestReservation(
                        DevReservation(
                            childId = testChild.id,
                            date = date,
                            startTime = LocalTime.of(8, 15),
                            endTime = LocalTime.of(8, 16),
                            createdBy = admin.evakaUserId
                        )
                    )
                }
        }

        val result = getReport(date, date)
        assertThat(result)
            .extracting({ it.childLastName }, { it.childFirstName }, { it.date })
            .containsExactlyInAnyOrder(
                Tuple(testChild_1.lastName, testChild_1.firstName, date),
                Tuple(testChild_2.lastName, testChild_2.firstName, date),
                Tuple(testChild_3.lastName, testChild_3.firstName, date),
                Tuple(testChild_4.lastName, testChild_4.firstName, date),
                Tuple(testChild_5.lastName, testChild_5.firstName, date),
                Tuple(testChild_6.lastName, testChild_6.firstName, date),
                Tuple(testChild_7.lastName, testChild_7.firstName, date),
                Tuple(testChild_8.lastName, testChild_8.firstName, date)
            )
    }

    @Test
    fun `group ids filter works`() {
        val date = LocalDate.of(2020, 5, 28)
        val group1 =
            db.transaction { tx ->
                tx.insertTestDaycareGroup(
                        DevDaycareGroup(daycareId = testDaycare.id, name = "Testiläiset 1")
                    )
                    .let { Group(it, "Testiläiset 1") }
            }
        val group2 =
            db.transaction { tx ->
                tx.insertTestDaycareGroup(
                        DevDaycareGroup(daycareId = testDaycare.id, name = "Testiläiset 2")
                    )
                    .let { Group(it, "Testiläiset 2") }
            }
        db.transaction { tx ->
            tx.insertTestDaycareGroupPlacement(
                daycarePlacementId =
                    tx.insertTestPlacement(
                        childId = testChild_1.id,
                        unitId = testDaycare.id,
                        startDate = date,
                        endDate = date
                    ),
                groupId = group1.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(8, 16),
                    createdBy = admin.evakaUserId
                )
            )
            tx.insertTestDaycareGroupPlacement(
                daycarePlacementId =
                    tx.insertTestPlacement(
                        childId = testChild_2.id,
                        unitId = testDaycare.id,
                        startDate = date,
                        endDate = date
                    ),
                groupId = group1.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_2.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(8, 16),
                    createdBy = admin.evakaUserId
                )
            )
            tx.insertTestDaycareGroupPlacement(
                daycarePlacementId =
                    tx.insertTestPlacement(
                        childId = testChild_3.id,
                        unitId = testDaycare.id,
                        startDate = date,
                        endDate = date
                    ),
                groupId = group2.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_3.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(8, 16),
                    createdBy = admin.evakaUserId
                )
            )
            tx.insertTestPlacement(
                childId = testChild_4.id,
                unitId = testDaycare.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_4.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(8, 16),
                    createdBy = admin.evakaUserId
                )
            )
        }

        val result = getReport(date, date, listOf(group1.id, group2.id))
        assertThat(result)
            .extracting({ it.groupId }, { it.groupName }, { it.childId })
            .containsExactlyInAnyOrder(
                Tuple(group1.id, group1.name, testChild_1.id),
                Tuple(group1.id, group1.name, testChild_2.id),
                Tuple(group2.id, group2.name, testChild_3.id)
            )
    }

    @Test
    fun `group placement without group ids filter works`() {
        val date = LocalDate.of(2020, 5, 28)
        db.transaction { tx ->
            val placementId =
                tx.insertTestPlacement(
                    childId = testChild_1.id,
                    unitId = testDaycare.id,
                    startDate = date,
                    endDate = date
                )
            val groupId =
                tx.insertTestDaycareGroup(
                    DevDaycareGroup(daycareId = testDaycare.id, startDate = date, endDate = date)
                )
            tx.insertTestDaycareGroupPlacement(
                daycarePlacementId = placementId,
                groupId = groupId,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(8, 16),
                    createdBy = admin.evakaUserId
                )
            )
        }

        val result = getReport(date, date, null)
        assertThat(result)
            .extracting({ it.groupId }, { it.childId })
            .containsExactlyInAnyOrder(Tuple(null, testChild_1.id))
    }

    @Test
    fun `empty group ids works`() {
        val date = LocalDate.of(2020, 5, 28)
        db.transaction { tx ->
            tx.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = date,
                endDate = date
            )
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = date,
                    startTime = LocalTime.of(8, 15),
                    endTime = LocalTime.of(8, 16),
                    createdBy = admin.evakaUserId
                )
            )
        }

        val result = getReport(date, date, listOf())
        assertThat(result)
            .extracting({ it.groupId }, { it.childId })
            .containsExactlyInAnyOrder(Tuple(null, testChild_1.id))
    }

    @Test
    fun `absences are supported`() {
        val startDate = LocalDate.of(2022, 10, 24)
        val endDate = LocalDate.of(2022, 10, 28)
        db.transaction { tx ->
            tx.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = startDate,
                endDate = endDate
            )
            FiniteDateRange(startDate, endDate).dates().forEach { date ->
                tx.insertTestReservation(
                    DevReservation(
                        childId = testChild_1.id,
                        date = date,
                        startTime = LocalTime.of(8, 15),
                        endTime = LocalTime.of(15, 48),
                        createdBy = admin.evakaUserId
                    )
                )
            }
            tx.insertTestAbsence(
                childId = testChild_1.id,
                date = LocalDate.of(2022, 10, 27),
                category = AbsenceCategory.BILLABLE,
                absenceType = AbsenceType.SICKLEAVE
            )
            tx.insertTestAbsence(
                childId = testChild_1.id,
                date = LocalDate.of(2022, 10, 28),
                category = AbsenceCategory.BILLABLE,
                absenceType = AbsenceType.PARENTLEAVE
            )
        }

        val result = getReport(startDate, endDate)
        assertThat(result)
            .extracting(
                { it.childId },
                { it.date },
                { it.reservationStartTime },
                { it.absenceType }
            )
            .containsExactlyInAnyOrder(
                Tuple(testChild_1.id, LocalDate.of(2022, 10, 24), LocalTime.of(8, 15), null),
                Tuple(testChild_1.id, LocalDate.of(2022, 10, 25), LocalTime.of(8, 15), null),
                Tuple(testChild_1.id, LocalDate.of(2022, 10, 26), LocalTime.of(8, 15), null),
                Tuple(
                    testChild_1.id,
                    LocalDate.of(2022, 10, 27),
                    LocalTime.of(8, 15),
                    AbsenceType.SICKLEAVE
                ),
                Tuple(
                    testChild_1.id,
                    LocalDate.of(2022, 10, 28),
                    LocalTime.of(8, 15),
                    AbsenceType.PARENTLEAVE
                )
            )
    }

    @Test
    fun `daily service times are returned if exists and there is no reservation for the day`() {
        val startDate = LocalDate.of(2022, 10, 24)
        val endDate = LocalDate.of(2022, 10, 26)
        db.transaction { tx ->
            tx.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = startDate,
                endDate = endDate
            )

            // 8-16 every day
            tx.insertTestDailyServiceTimes(
                DevDailyServiceTimes(
                    childId = testChild_1.id,
                    validityPeriod = DateRange(startDate, endDate)
                )
            )

            // Reservation on the second day 9:00 - 15:00
            tx.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = startDate.plusDays(1),
                    startTime = LocalTime.of(9, 0),
                    endTime = LocalTime.of(15, 0),
                    createdBy = admin.evakaUserId
                )
            )

            // Absence on the third day
            tx.insertTestAbsence(
                childId = testChild_1.id,
                date = endDate,
                category = AbsenceCategory.BILLABLE,
                absenceType = AbsenceType.SICKLEAVE
            )
        }

        val result = getReport(startDate, endDate, null)
        assertThat(result)
            .extracting(
                { it.childId },
                { it.date },
                { it.reservationStartTime },
                { it.absenceType }
            )
            .containsExactlyInAnyOrder(
                Tuple(testChild_1.id, LocalDate.of(2022, 10, 24), LocalTime.of(8, 0), null),
                Tuple(testChild_1.id, LocalDate.of(2022, 10, 25), LocalTime.of(9, 0), null),
                Tuple(
                    testChild_1.id,
                    LocalDate.of(2022, 10, 26),
                    LocalTime.of(8, 0),
                    AbsenceType.SICKLEAVE
                )
            )
    }

    private fun getReport(
        startDate: LocalDate,
        endDate: LocalDate,
        groupIds: List<GroupId>? = null
    ): List<AttendanceReservationReportByChildRow> {
        return attendanceReservationReportController.getAttendanceReservationReportByUnitAndChild(
            dbInstance(),
            RealEvakaClock(),
            admin,
            testDaycare.id,
            startDate,
            endDate,
            groupIds
        )
    }
}
