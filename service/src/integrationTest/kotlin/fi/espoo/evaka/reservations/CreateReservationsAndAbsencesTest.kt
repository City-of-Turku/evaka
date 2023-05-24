// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.reservations

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.dailyservicetimes.DailyServiceTimesController
import fi.espoo.evaka.dailyservicetimes.DailyServiceTimesValue
import fi.espoo.evaka.daycare.service.AbsenceCategory
import fi.espoo.evaka.daycare.service.AbsenceType
import fi.espoo.evaka.daycare.service.getAbsencesOfChildByRange
import fi.espoo.evaka.holidayperiod.createHolidayPeriod
import fi.espoo.evaka.insertGeneralTestFixtures
import fi.espoo.evaka.pis.service.insertGuardian
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.shared.EvakaUserId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.CitizenAuthLevel
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.auth.insertDaycareAclRow
import fi.espoo.evaka.shared.dev.DevReservation
import fi.espoo.evaka.shared.dev.insertTestAbsence
import fi.espoo.evaka.shared.dev.insertTestHoliday
import fi.espoo.evaka.shared.dev.insertTestPlacement
import fi.espoo.evaka.shared.dev.insertTestReservation
import fi.espoo.evaka.shared.domain.BadRequest
import fi.espoo.evaka.shared.domain.DateRange
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.domain.MockEvakaClock
import fi.espoo.evaka.shared.domain.TimeRange
import fi.espoo.evaka.testAdult_1
import fi.espoo.evaka.testChild_1
import fi.espoo.evaka.testChild_2
import fi.espoo.evaka.testDaycare
import fi.espoo.evaka.testDecisionMaker_1
import java.time.LocalDate
import java.time.LocalTime
import kotlin.test.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired

class CreateReservationsAndAbsencesTest : FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired private lateinit var dailyServiceTimesController: DailyServiceTimesController

    private val monday = LocalDate.of(2021, 8, 23)
    private val tuesday = monday.plusDays(1)
    private val wednesday = monday.plusDays(2)
    private val startTime = LocalTime.of(9, 0)
    private val endTime: LocalTime = LocalTime.of(17, 0)
    private val queryRange = FiniteDateRange(monday.minusDays(10), monday.plusDays(10))

    private val citizenUser = AuthenticatedUser.Citizen(testAdult_1.id, CitizenAuthLevel.STRONG)
    private val employeeUser = AuthenticatedUser.Employee(testDecisionMaker_1.id, setOf())

    @BeforeEach
    fun before() {
        db.transaction { it.insertGeneralTestFixtures() }
    }

    @Test
    fun `adding two reservations works in a basic case`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = tuesday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = tuesday,
                        TimeRange(startTime, endTime),
                    )
                )
            )
        }

        // then 2 reservations are added
        val reservations =
            db.read { it.getReservationsCitizen(monday, testAdult_1.id, queryRange) }
                .flatMap {
                    it.children.mapNotNull { child ->
                        child.reservations.takeIf { it.isNotEmpty() }
                    }
                }
        assertEquals(2, reservations.size)
    }

    @Test
    fun `reservation is not added outside placement nor for placements that don't require reservations`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                type = PlacementType.PRESCHOOL,
                startDate = monday,
                endDate = monday
            )
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                type = PlacementType.PRESCHOOL_DAYCARE,
                startDate = tuesday,
                endDate = tuesday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        // Only tuesday has a placement that requires reservations
                        date = tuesday,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = wednesday,
                        TimeRange(startTime, endTime),
                    )
                )
            )
        }

        // then only 1 reservation is added
        val reservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        queryRange,
                    )
                }
                .mapNotNull { dailyData ->
                    dailyData.date.takeIf {
                        dailyData.children.any { it.reservations.isNotEmpty() }
                    }
                }
        assertEquals(1, reservations.size)
        assertEquals(tuesday, reservations.first())
    }

    @Test
    fun `reservation is not added if user is not guardian of the child`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = tuesday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_2.id)
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = tuesday,
                        TimeRange(startTime, endTime),
                    )
                )
            )
        }

        // then no reservation are added
        val reservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        queryRange,
                    )
                }
                .mapNotNull { dailyData ->
                    dailyData.date.takeIf {
                        dailyData.children.any { it.reservations.isNotEmpty() }
                    }
                }
        assertEquals(0, reservations.size)
    }

    @Test
    fun `reservation is not added outside operating days`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday.minusDays(1),
                endDate = monday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday.minusDays(1),
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(startTime, endTime),
                    )
                )
            )
        }

        // then only 1 reservation is added
        val reservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        queryRange,
                    )
                }
                .mapNotNull { dailyData ->
                    dailyData.date.takeIf {
                        dailyData.children.any { it.reservations.isNotEmpty() }
                    }
                }
        assertEquals(1, reservations.size)
        assertEquals(monday, reservations.first())
    }

    @Test
    fun `reservation is not added on holiday`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = tuesday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.insertTestHoliday(tuesday)
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = tuesday,
                        TimeRange(startTime, endTime),
                    )
                )
            )
        }

        // then only 1 reservation is added
        val reservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        queryRange,
                    )
                }
                .mapNotNull { dailyData ->
                    dailyData.date.takeIf {
                        dailyData.children.any { it.reservations.isNotEmpty() }
                    }
                }
        assertEquals(1, reservations.size)
        assertEquals(monday, reservations.first())
    }

    @Test
    fun `absences are removed from days with reservation`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = tuesday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.insertTestAbsence(
                childId = testChild_1.id,
                date = monday,
                category = AbsenceCategory.BILLABLE,
                modifiedBy = EvakaUserId(testAdult_1.id.raw)
            )
            it.insertTestAbsence(
                childId = testChild_1.id,
                date = tuesday,
                category = AbsenceCategory.BILLABLE,
                modifiedBy = EvakaUserId(testAdult_1.id.raw)
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(startTime, endTime),
                    ),
                )
            )
        }

        // then 1 reservation is added
        val reservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        queryRange,
                    )
                }
                .mapNotNull { dailyData ->
                    dailyData.date.takeIf {
                        dailyData.children.any { it.reservations.isNotEmpty() }
                    }
                }
        assertEquals(1, reservations.size)
        assertEquals(monday, reservations.first())

        // and 1st absence has been removed
        val absences =
            db.read { it.getAbsencesOfChildByRange(testChild_1.id, DateRange(monday, tuesday)) }
        assertEquals(1, absences.size)
        assertEquals(tuesday, absences.first().date)
    }

    @Test
    fun `absences and reservations are removed from empty days`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = tuesday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.insertTestAbsence(
                childId = testChild_1.id,
                date = monday,
                category = AbsenceCategory.BILLABLE,
                modifiedBy = EvakaUserId(testAdult_1.id.raw)
            )
            it.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = tuesday,
                    startTime = startTime,
                    endTime = endTime,
                    createdBy = EvakaUserId(testAdult_1.id.raw)
                )
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Nothing(
                        childId = testChild_1.id,
                        date = monday,
                    ),
                    DailyReservationRequest.Nothing(
                        childId = testChild_1.id,
                        date = tuesday,
                    )
                )
            )
        }

        // then no reservations exist
        val reservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        queryRange,
                    )
                }
                .flatMap { dailyData -> dailyData.children.flatMap { it.reservations } }
        assertEquals(listOf(), reservations)

        // and no absences exist
        val absences =
            db.read { it.getAbsencesOfChildByRange(testChild_1.id, DateRange(monday, tuesday)) }
        assertEquals(listOf(), absences)
    }

    @Test
    fun `free absences are not overwritten`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = tuesday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.insertTestAbsence(
                childId = testChild_1.id,
                date = monday,
                category = AbsenceCategory.BILLABLE,
                modifiedBy = EvakaUserId(testAdult_1.id.raw)
            )
            it.insertTestAbsence(
                childId = testChild_1.id,
                date = tuesday,
                category = AbsenceCategory.BILLABLE,
                absenceType = AbsenceType.FREE_ABSENCE,
                modifiedBy = EvakaUserId(testAdult_1.id.raw)
            )
            it.insertTestAbsence(
                childId = testChild_1.id,
                date = wednesday,
                category = AbsenceCategory.BILLABLE,
                absenceType = AbsenceType.FREE_ABSENCE,
                modifiedBy = EvakaUserId(testAdult_1.id.raw)
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = tuesday,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Nothing(
                        childId = testChild_1.id,
                        date = wednesday,
                    )
                )
            )
        }

        // then 1 reservation is added
        val reservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        queryRange,
                    )
                }
                .mapNotNull { dailyData ->
                    dailyData.date.takeIf {
                        dailyData.children.any { it.reservations.isNotEmpty() }
                    }
                }
        assertEquals(monday, reservations.first())
        assertEquals(1, reservations.size)

        // and 1st absence has been removed
        val absences =
            db.read { it.getAbsencesOfChildByRange(testChild_1.id, DateRange(monday, wednesday)) }
        assertEquals(listOf(tuesday, wednesday), absences.map { it.date })
        assertEquals(
            listOf(AbsenceType.FREE_ABSENCE, AbsenceType.FREE_ABSENCE),
            absences.map { it.absenceType }
        )
    }

    @Test
    fun `irregular daily service times absences are not overwritten`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = wednesday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.insertDaycareAclRow(testDaycare.id, testDecisionMaker_1.id, UserRole.UNIT_SUPERVISOR)
        }

        dailyServiceTimesController.postDailyServiceTimes(
            dbInstance(),
            AuthenticatedUser.Employee(testDecisionMaker_1.id, setOf()),
            MockEvakaClock(HelsinkiDateTime.of(monday.minusDays(1), LocalTime.of(12, 0))),
            testChild_1.id,
            DailyServiceTimesValue.IrregularTimes(
                validityPeriod = DateRange(monday, null),
                // absences are generated for null days
                monday = null,
                tuesday = null,
                wednesday = null,
                thursday = TimeRange(LocalTime.of(8, 0), LocalTime.of(16, 0)),
                friday = TimeRange(LocalTime.of(8, 0), LocalTime.of(16, 0)),
                saturday = null,
                sunday = null,
            )
        )

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Absent(
                        childId = testChild_1.id,
                        date = tuesday,
                    ),
                    DailyReservationRequest.Nothing(
                        childId = testChild_1.id,
                        date = wednesday,
                    ),
                )
            )
        }

        // then 3 non-editable absences are left
        val absences =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        queryRange,
                    )
                }
                .flatMap { dailyData ->
                    dailyData.children.map { child ->
                        Triple(dailyData.date, child.absence, child.absenceEditable)
                    }
                }
        assertEquals(
            listOf(
                Triple(monday, AbsenceType.OTHER_ABSENCE, false),
                Triple(tuesday, AbsenceType.OTHER_ABSENCE, false),
                Triple(wednesday, AbsenceType.OTHER_ABSENCE, false),
            ),
            absences
        )
    }

    @Test
    fun `previous reservation is overwritten`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = tuesday
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = tuesday,
                        TimeRange(startTime, endTime),
                    )
                )
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = monday,
                        TimeRange(LocalTime.of(12, 0), endTime),
                    )
                )
            )
        }

        // then 1 reservation is changed
        val reservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        queryRange,
                    )
                }
                .flatMap { dailyData ->
                    dailyData.children.map { child -> dailyData.date to child.reservations }
                }
        assertEquals(2, reservations.size)
        assertEquals(monday, reservations[0].first)
        assertEquals(
            LocalTime.of(12, 0),
            (reservations[0].second[0] as Reservation.Times).startTime
        )
        assertEquals(tuesday, reservations[1].first)
        assertEquals(LocalTime.of(9, 0), (reservations[1].second[0] as Reservation.Times).startTime)
    }

    @Test
    fun `reservations without times can be added if reservations are not required (removes absences)`() {
        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                type = PlacementType.PRESCHOOL, // <-- reservations are not required
                startDate = monday,
                endDate = monday.plusYears(1)
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.insertTestAbsence(
                childId = testChild_1.id,
                date = monday,
                category = AbsenceCategory.BILLABLE,
                modifiedBy = EvakaUserId(testAdult_1.id.raw)
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Present(
                        childId = testChild_1.id,
                        date = monday,
                    )
                )
            )
        }

        // then
        val data =
            db.read {
                it.getReservationsCitizen(monday, testAdult_1.id, FiniteDateRange(monday, monday))
            }
        val reservations =
            data.flatMap { dailyData -> dailyData.children.flatMap { child -> child.reservations } }
        val absences =
            data.flatMap { dailyData -> dailyData.children.map { child -> child.absence } }
        assertEquals(0, reservations.size)
        assertEquals(0, absences.size)
    }

    @Test
    fun `reservations without times can be added to open holiday period`() {
        val holidayPeriodStart = monday.plusMonths(1)
        val holidayPeriodEnd = holidayPeriodStart.plusWeeks(1).minusDays(1)
        val holidayPeriod = FiniteDateRange(holidayPeriodStart, holidayPeriodEnd)

        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = monday.plusYears(1)
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.createHolidayPeriod(holidayPeriod, monday)
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Present(
                        childId = testChild_1.id,
                        date = holidayPeriodStart,
                    )
                )
            )
        }

        // then
        val dailyReservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        holidayPeriod,
                    )
                }
                .flatMap { dailyData ->
                    dailyData.children.map { child -> dailyData.date to child.reservations }
                }
        assertEquals(1, dailyReservations.size)
        dailyReservations.first().let { (date, reservations) ->
            assertEquals(holidayPeriodStart, date)
            assertEquals(listOf(Reservation.NoTimes), reservations)
        }
    }

    @Test
    fun `reservations without times cannot be added to closed holiday period or outside holiday periods`() {
        val holidayPeriodStart = monday.plusMonths(1)
        val holidayPeriodEnd = holidayPeriodStart.plusWeeks(1).minusDays(1)
        val holidayPeriod = FiniteDateRange(holidayPeriodStart, holidayPeriodEnd)

        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = monday.plusYears(1)
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.createHolidayPeriod(holidayPeriod, monday.minusDays(1))
        }

        // when
        assertThrows<BadRequest> {
            // Closed holiday period
            db.transaction {
                createReservationsAndAbsences(
                    it,
                    monday,
                    citizenUser,
                    listOf(
                        DailyReservationRequest.Present(
                            childId = testChild_1.id,
                            date = holidayPeriodStart,
                        )
                    )
                )
            }
        }

        assertThrows<BadRequest> {
            // Outside holiday periods
            db.transaction {
                createReservationsAndAbsences(
                    it,
                    monday,
                    citizenUser,
                    listOf(
                        DailyReservationRequest.Present(
                            childId = testChild_1.id,
                            date = holidayPeriodEnd.plusDays(1),
                        )
                    )
                )
            }
        }
    }

    @Test
    fun `citizen cannot override days with absences or without reservations in closed holiday periods`() {
        val holidayPeriodStart = monday.plusMonths(1)
        val holidayPeriodEnd = holidayPeriodStart.plusWeeks(1).minusDays(1)
        val holidayPeriod = FiniteDateRange(holidayPeriodStart, holidayPeriodEnd)

        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = monday.plusYears(1)
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.createHolidayPeriod(holidayPeriod, monday.minusDays(1))
            it.insertAbsences(
                citizenUser.evakaUserId,
                listOf(
                    AbsenceInsert(
                        childId = testChild_1.id,
                        date = holidayPeriodStart,
                        absenceType = AbsenceType.OTHER_ABSENCE,
                    ),
                    AbsenceInsert(
                        childId = testChild_1.id,
                        date = holidayPeriodStart.plusDays(1),
                        absenceType = AbsenceType.OTHER_ABSENCE,
                    )
                )
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = holidayPeriodStart,
                        TimeRange(startTime, endTime),
                    ),
                    DailyReservationRequest.Nothing(
                        childId = testChild_1.id,
                        date = holidayPeriodStart.plusDays(1),
                    ),
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = holidayPeriodStart.plusDays(2),
                        TimeRange(startTime, endTime),
                    )
                )
            )
        }

        // then
        val reservationData =
            db.read {
                it.getReservationsCitizen(
                    monday,
                    testAdult_1.id,
                    holidayPeriod,
                )
            }
        val allReservations =
            reservationData.flatMap { dailyData ->
                dailyData.children.flatMap { child -> child.reservations }
            }
        val absenceDates =
            reservationData.flatMap { dailyData ->
                if (dailyData.children.any { child -> child.absence != null })
                    listOf(dailyData.date)
                else emptyList()
            }
        assertEquals(0, allReservations.size)
        assertEquals(listOf(holidayPeriodStart, holidayPeriodStart.plusDays(1)), absenceDates)
    }

    @Test
    fun `citizen cannot override absences in closed holiday periods when reservations are not required`() {
        val holidayPeriodStart = monday.plusMonths(1)
        val holidayPeriodEnd = holidayPeriodStart.plusWeeks(1).minusDays(1)
        val holidayPeriod = FiniteDateRange(holidayPeriodStart, holidayPeriodEnd)

        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                type = PlacementType.PRESCHOOL, // <-- reservations not required
                startDate = monday,
                endDate = monday.plusYears(1)
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.createHolidayPeriod(holidayPeriod, monday.minusDays(1))
            it.insertAbsences(
                citizenUser.evakaUserId,
                listOf(
                    AbsenceInsert(
                        childId = testChild_1.id,
                        date = holidayPeriodStart,
                        absenceType = AbsenceType.OTHER_ABSENCE,
                    )
                )
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Present(
                        childId = testChild_1.id,
                        date = holidayPeriodStart,
                    ),
                )
            )
        }

        // then
        val reservationData =
            db.read {
                it.getReservationsCitizen(
                    monday,
                    testAdult_1.id,
                    holidayPeriod,
                )
            }
        val allReservations =
            reservationData.flatMap { dailyData ->
                dailyData.children.flatMap { child -> child.reservations }
            }
        val absenceDates =
            reservationData.flatMap { dailyData ->
                if (dailyData.children.any { child -> child.absence != null })
                    listOf(dailyData.date)
                else emptyList()
            }
        assertEquals(0, allReservations.size)
        assertEquals(listOf(holidayPeriodStart), absenceDates)
    }

    @Test
    fun `citizen cannot remove reservations without times in closed holiday periods when reservations are required`() {
        val holidayPeriodStart = monday.plusMonths(1)
        val holidayPeriodEnd = holidayPeriodStart.plusWeeks(1).minusDays(1)
        val holidayPeriod = FiniteDateRange(holidayPeriodStart, holidayPeriodEnd)

        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                type = PlacementType.DAYCARE,
                startDate = monday,
                endDate = monday.plusYears(1)
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.createHolidayPeriod(holidayPeriod, monday.minusDays(1))
            it.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = holidayPeriodStart,
                    startTime = null,
                    endTime = null,
                    createdBy = citizenUser.evakaUserId,
                )
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                citizenUser,
                listOf(
                    DailyReservationRequest.Nothing(
                        childId = testChild_1.id,
                        date = holidayPeriodStart,
                    ),
                )
            )
        }

        // then
        val reservationData =
            db.read {
                it.getReservationsCitizen(
                    monday,
                    testAdult_1.id,
                    holidayPeriod,
                )
            }
        val allReservations =
            reservationData.flatMap { dailyData ->
                dailyData.children.flatMap { child ->
                    child.reservations.map { child.childId to it }
                }
            }

        assertEquals(listOf(testChild_1.id to Reservation.NoTimes), allReservations)
    }

    @Test
    fun `employee can override absences in closed holiday periods`() {
        val holidayPeriodStart = monday.plusMonths(1)
        val holidayPeriodEnd = holidayPeriodStart.plusWeeks(1).minusDays(1)
        val holidayPeriod = FiniteDateRange(holidayPeriodStart, holidayPeriodEnd)

        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = monday.plusYears(1)
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.createHolidayPeriod(holidayPeriod, monday.minusDays(1))
            it.insertAbsences(
                citizenUser.evakaUserId,
                listOf(
                    AbsenceInsert(
                        childId = testChild_1.id,
                        date = holidayPeriodStart,
                        absenceType = AbsenceType.OTHER_ABSENCE,
                    )
                )
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                employeeUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = holidayPeriodStart,
                        TimeRange(startTime, endTime),
                    )
                )
            )
        }

        // then
        val reservationData =
            db.read {
                it.getReservationsCitizen(
                    monday,
                    testAdult_1.id,
                    holidayPeriod,
                )
            }
        val allReservations =
            reservationData.flatMap { dailyData ->
                dailyData.children.map { child -> dailyData.date to child.reservations }
            }
        val absenceDates =
            reservationData.flatMap { dailyData ->
                if (dailyData.children.any { child -> child.absence != null })
                    listOf(dailyData.date)
                else emptyList()
            }
        assertEquals(1, allReservations.size)
        allReservations.first().let { (date, reservations) ->
            assertEquals(holidayPeriodStart, date)
            assertEquals(listOf(Reservation.Times(startTime, endTime)), reservations)
        }
        assertEquals(0, absenceDates.size)
    }

    @Test
    fun `reservations can be overridden in closed holiday periods`() {
        val holidayPeriodStart = monday.plusMonths(1)
        val holidayPeriodEnd = holidayPeriodStart.plusWeeks(1).minusDays(1)
        val holidayPeriod = FiniteDateRange(holidayPeriodStart, holidayPeriodEnd)

        // given
        db.transaction {
            it.insertTestPlacement(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                startDate = monday,
                endDate = monday.plusYears(1)
            )
            it.insertGuardian(guardianId = testAdult_1.id, childId = testChild_1.id)
            it.createHolidayPeriod(holidayPeriod, monday.minusDays(1))
            it.insertTestReservation(
                // NoTimes reservation
                DevReservation(
                    childId = testChild_1.id,
                    date = holidayPeriodStart,
                    startTime = null,
                    endTime = null,
                    createdBy = citizenUser.evakaUserId
                )
            )
        }

        // when
        db.transaction {
            createReservationsAndAbsences(
                it,
                monday,
                employeeUser,
                listOf(
                    DailyReservationRequest.Reservations(
                        childId = testChild_1.id,
                        date = holidayPeriodStart,
                        TimeRange(startTime, endTime),
                    )
                )
            )
        }

        // then
        val allReservations =
            db.read {
                    it.getReservationsCitizen(
                        monday,
                        testAdult_1.id,
                        holidayPeriod,
                    )
                }
                .flatMap { dailyData ->
                    dailyData.children.map { child -> dailyData.date to child.reservations }
                }
        assertEquals(1, allReservations.size)
        allReservations.first().let { (date, reservations) ->
            assertEquals(holidayPeriodStart, date)
            assertEquals(listOf(Reservation.Times(startTime, endTime)), reservations)
        }
    }
}
