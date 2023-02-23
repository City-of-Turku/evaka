// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.reservations

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.dailyservicetimes.DailyServiceTimesType
import fi.espoo.evaka.dailyservicetimes.DailyServiceTimesValue
import fi.espoo.evaka.daycare.service.AbsenceCategory
import fi.espoo.evaka.daycare.service.AbsenceType
import fi.espoo.evaka.daycare.service.ChildServiceNeedInfo
import fi.espoo.evaka.insertGeneralTestFixtures
import fi.espoo.evaka.serviceneed.insertServiceNeed
import fi.espoo.evaka.shared.EmployeeId
import fi.espoo.evaka.shared.EvakaUserId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.auth.insertDaycareAclRow
import fi.espoo.evaka.shared.dev.DevDailyServiceTimes
import fi.espoo.evaka.shared.dev.DevDaycareGroup
import fi.espoo.evaka.shared.dev.DevEmployee
import fi.espoo.evaka.shared.dev.DevReservation
import fi.espoo.evaka.shared.dev.insertTestAbsence
import fi.espoo.evaka.shared.dev.insertTestBackUpCare
import fi.espoo.evaka.shared.dev.insertTestChildAttendance
import fi.espoo.evaka.shared.dev.insertTestDailyServiceTimes
import fi.espoo.evaka.shared.dev.insertTestDaycareGroup
import fi.espoo.evaka.shared.dev.insertTestDaycareGroupPlacement
import fi.espoo.evaka.shared.dev.insertTestEmployee
import fi.espoo.evaka.shared.dev.insertTestPlacement
import fi.espoo.evaka.shared.dev.insertTestReservation
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.domain.RealEvakaClock
import fi.espoo.evaka.shared.domain.TimeRange
import fi.espoo.evaka.snDaycareContractDays15
import fi.espoo.evaka.snDaycareFullDay35
import fi.espoo.evaka.testChild_1
import fi.espoo.evaka.testChild_4
import fi.espoo.evaka.testChild_5
import fi.espoo.evaka.testChild_6
import fi.espoo.evaka.testDaycare
import fi.espoo.evaka.testDaycare2
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import kotlin.test.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

class AttendanceReservationsControllerIntegrationTest :
    FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired lateinit var attendanceReservationController: AttendanceReservationController

    private val employeeId = EmployeeId(UUID.randomUUID())
    private val clock = RealEvakaClock()

    private val mon = LocalDate.of(2021, 3, 1)
    private val tue = LocalDate.of(2021, 3, 2)
    private val wed = LocalDate.of(2021, 3, 3)
    private val thu = LocalDate.of(2021, 3, 4)
    private val fri = LocalDate.of(2021, 3, 5)
    private val monFri = FiniteDateRange(mon, fri)

    private val unitOperationalDays =
        monFri
            .dates()
            .map { UnitAttendanceReservations.OperationalDay(it, isHoliday = false) }
            .toList()

    private val testGroup1 = DevDaycareGroup(daycareId = testDaycare.id, name = "Test group 1")
    private val testGroup2 = DevDaycareGroup(daycareId = testDaycare.id, name = "Test group 2")

    @BeforeEach
    fun beforeEach() {
        db.transaction {
            it.insertGeneralTestFixtures()
            it.insertTestDaycareGroup(testGroup1)
            it.insertTestDaycareGroup(testGroup2)

            it.insertTestEmployee(DevEmployee(employeeId))
            it.insertDaycareAclRow(testDaycare.id, employeeId, UserRole.STAFF)
        }
    }

    @Test
    fun `generates the correct result in all cases`() {
        db.transaction {
            val child1PlacementId =
                it.insertTestPlacement(
                    childId = testChild_1.id,
                    unitId = testDaycare.id,
                    startDate = mon,
                    endDate = fri
                )
            it.insertServiceNeed(
                placementId = child1PlacementId,
                startDate = mon,
                endDate = wed,
                optionId = snDaycareContractDays15.id,
                shiftCare = false,
                confirmedBy = null,
                confirmedAt = null
            )
            it.insertServiceNeed(
                placementId = child1PlacementId,
                startDate = thu,
                endDate = fri,
                optionId = snDaycareFullDay35.id,
                shiftCare = false,
                confirmedBy = null,
                confirmedAt = null
            )
            it.insertTestDaycareGroupPlacement(
                daycarePlacementId = child1PlacementId,
                groupId = testGroup1.id,
                startDate = mon,
                endDate = wed
            )
            it.insertTestDaycareGroupPlacement(
                daycarePlacementId = child1PlacementId,
                groupId = testGroup2.id,
                startDate = thu,
                endDate = fri
            )
            it.insertTestReservation(
                DevReservation(
                    childId = testChild_1.id,
                    date = mon,
                    startTime = LocalTime.of(8, 0),
                    endTime = LocalTime.of(16, 0),
                    createdBy = EvakaUserId(employeeId.raw)
                )
            )
            it.insertTestChildAttendance(
                childId = testChild_1.id,
                unitId = testDaycare.id,
                arrived = HelsinkiDateTime.of(mon, LocalTime.of(8, 15)),
                departed = HelsinkiDateTime.of(mon, LocalTime.of(16, 5))
            )
            it.insertTestAbsence(
                childId = testChild_1.id,
                date = tue,
                category = AbsenceCategory.BILLABLE,
                absenceType = AbsenceType.OTHER_ABSENCE,
                modifiedBy = EvakaUserId(employeeId.raw)
            )

            // No group placement -> ungrouped
            // Placement doesn't cover the whole period
            it.insertTestPlacement(
                childId = testChild_4.id,
                unitId = testDaycare.id,
                startDate = wed,
                endDate = fri
            )

            // Placement in other unit, backup in this unit's group 2
            val testChild5PlacementId =
                it.insertTestPlacement(
                    childId = testChild_5.id,
                    unitId = testDaycare2.id,
                    startDate = mon,
                    endDate = fri
                )
            it.insertTestBackUpCare(
                childId = testChild_5.id,
                unitId = testDaycare.id,
                groupId = testGroup2.id,
                startDate = fri,
                endDate = fri
            )
            it.insertServiceNeed(
                placementId = testChild5PlacementId,
                startDate = mon,
                endDate = fri,
                optionId = snDaycareContractDays15.id,
                shiftCare = false,
                confirmedBy = null,
                confirmedAt = null
            )

            it.insertTestDailyServiceTimes(
                DevDailyServiceTimes(
                    childId = testChild_5.id,
                    validityPeriod = monFri.asDateRange(),
                    type = DailyServiceTimesType.REGULAR,
                    regularTimes = TimeRange(LocalTime.of(8, 0), LocalTime.of(16, 0))
                )
            )

            // Placed to this unit's group 1...
            val child6PlacementId =
                it.insertTestPlacement(
                    childId = testChild_6.id,
                    unitId = testDaycare.id,
                    startDate = wed,
                    endDate = fri
                )
            it.insertTestDaycareGroupPlacement(
                daycarePlacementId = child6PlacementId,
                groupId = testGroup1.id,
                startDate = wed,
                endDate = fri
            )
            // ... and has a backup in another group in this unit
            it.insertTestBackUpCare(
                childId = testChild_6.id,
                unitId = testDaycare.id,
                groupId = testGroup2.id,
                startDate = thu,
                endDate = thu
            )
            // ... and has a backup in another unit
            it.insertTestBackUpCare(
                childId = testChild_6.id,
                unitId = testDaycare2.id,
                startDate = fri,
                endDate = fri
            )
            // Reservation is shown in the result because the child is in this unit
            it.insertTestReservation(
                DevReservation(
                    childId = testChild_6.id,
                    date = thu,
                    startTime = LocalTime.of(9, 0),
                    endTime = LocalTime.of(15, 0),
                    createdBy = EvakaUserId(employeeId.raw)
                )
            )
            // Reservation is NOT shown in the result because the child is in another unit
            it.insertTestReservation(
                DevReservation(
                    childId = testChild_6.id,
                    date = fri,
                    startTime = LocalTime.of(7, 0),
                    endTime = LocalTime.of(17, 0),
                    createdBy = EvakaUserId(employeeId.raw)
                )
            )
        }

        val attendanceReservations = getAttendanceReservations()
        assertEquals(testDaycare.name, attendanceReservations.unit)
        assertEquals(unitOperationalDays, attendanceReservations.operationalDays)

        val group1SnInfos =
            attendanceReservations.unitServiceNeedInfo.groups.find { it.groupId == testGroup1.id }!!
        assertEquals(
            UnitAttendanceReservations.GroupServiceNeedInfo(
                groupId = testGroup1.id,
                childInfos =
                    listOf(
                        ChildServiceNeedInfo(
                            childId = testChild_1.id,
                            hasContractDays = true,
                            optionName = snDaycareContractDays15.nameFi,
                            validDuring = FiniteDateRange(mon, wed)
                        )
                    )
            ),
            group1SnInfos
        )

        val group2SnInfos =
            attendanceReservations.unitServiceNeedInfo.groups.find { it.groupId == testGroup2.id }!!
        assertEquals(
            listOf(
                ChildServiceNeedInfo(
                    childId = testChild_5.id,
                    hasContractDays = true,
                    optionName = snDaycareContractDays15.nameFi,
                    validDuring = FiniteDateRange(mon, fri)
                ),
                ChildServiceNeedInfo(
                    childId = testChild_1.id,
                    hasContractDays = false,
                    optionName = snDaycareFullDay35.nameFi,
                    validDuring = FiniteDateRange(thu, fri)
                )
            ),
            group2SnInfos.childInfos.sortedBy { it.validDuring.start }
        )

        val group1 = attendanceReservations.groups.find { it.group.id == testGroup1.id }!!
        assertEquals(
            listOf(
                UnitAttendanceReservations.ChildDailyRecords(
                    UnitAttendanceReservations.Child(
                        testChild_1.id,
                        testChild_1.firstName,
                        testChild_1.lastName,
                        testChild_1.preferredName,
                        testChild_1.dateOfBirth
                    ),
                    listOf(
                        mapOf(
                            mon to
                                UnitAttendanceReservations.ChildRecordOfDay(
                                    reservation =
                                        UnitAttendanceReservations.ReservationTimes(
                                            "08:00",
                                            "16:00"
                                        ),
                                    attendance =
                                        UnitAttendanceReservations.AttendanceTimes(
                                            "08:15",
                                            "16:05"
                                        ),
                                    absence = null,
                                    dailyServiceTimes = null,
                                    inOtherUnit = false,
                                    isInBackupGroup = false
                                ),
                            tue to
                                UnitAttendanceReservations.ChildRecordOfDay(
                                    reservation = null,
                                    attendance = null,
                                    absence =
                                        UnitAttendanceReservations.Absence(
                                            AbsenceType.OTHER_ABSENCE
                                        ),
                                    dailyServiceTimes = null,
                                    inOtherUnit = false,
                                    isInBackupGroup = false
                                ),
                            wed to
                                UnitAttendanceReservations.ChildRecordOfDay(
                                    reservation = null,
                                    attendance = null,
                                    absence = null,
                                    dailyServiceTimes = null,
                                    inOtherUnit = false,
                                    isInBackupGroup = false
                                )
                        )
                    )
                ),
                UnitAttendanceReservations.ChildDailyRecords(
                    UnitAttendanceReservations.Child(
                        testChild_6.id,
                        testChild_6.firstName,
                        testChild_6.lastName,
                        testChild_6.preferredName,
                        testChild_6.dateOfBirth
                    ),
                    listOf(
                        mapOf(
                            wed to
                                UnitAttendanceReservations.ChildRecordOfDay(
                                    reservation = null,
                                    attendance = null,
                                    absence = null,
                                    dailyServiceTimes = null,
                                    inOtherUnit = false,
                                    isInBackupGroup = false
                                ),
                            // Backup in group 2
                            thu to
                                UnitAttendanceReservations.ChildRecordOfDay(
                                    reservation =
                                        UnitAttendanceReservations.ReservationTimes(
                                            "09:00",
                                            "15:00"
                                        ),
                                    attendance = null,
                                    absence = null,
                                    dailyServiceTimes = null,
                                    inOtherUnit = false,
                                    isInBackupGroup = true
                                ),
                            // Backup in another unit
                            fri to
                                UnitAttendanceReservations.ChildRecordOfDay(
                                    reservation = null,
                                    attendance = null,
                                    absence = null,
                                    dailyServiceTimes = null,
                                    inOtherUnit = true,
                                    isInBackupGroup = false
                                )
                        )
                    )
                )
            ),
            group1.children.sortedBy { it.child.lastName }
        )

        val group2 = attendanceReservations.groups.find { it.group.id == testGroup2.id }!!
        assertEquals(
            listOf(
                UnitAttendanceReservations.ChildDailyRecords(
                    UnitAttendanceReservations.Child(
                        testChild_1.id,
                        testChild_1.firstName,
                        testChild_1.lastName,
                        testChild_1.preferredName,
                        testChild_1.dateOfBirth
                    ),
                    listOf(emptyChildRecords(FiniteDateRange(thu, fri)))
                ),
                UnitAttendanceReservations.ChildDailyRecords(
                    UnitAttendanceReservations.Child(
                        testChild_6.id,
                        testChild_6.firstName,
                        testChild_6.lastName,
                        testChild_6.preferredName,
                        testChild_6.dateOfBirth
                    ),
                    listOf(
                        mapOf(
                            // Backup in group 2
                            thu to
                                UnitAttendanceReservations.ChildRecordOfDay(
                                    reservation =
                                        UnitAttendanceReservations.ReservationTimes(
                                            "09:00",
                                            "15:00"
                                        ),
                                    attendance = null,
                                    absence = null,
                                    dailyServiceTimes = null,
                                    inOtherUnit = false,
                                    isInBackupGroup = true
                                )
                        )
                    )
                ),
                UnitAttendanceReservations.ChildDailyRecords(
                    UnitAttendanceReservations.Child(
                        testChild_5.id,
                        testChild_5.firstName,
                        testChild_5.lastName,
                        testChild_5.preferredName,
                        testChild_5.dateOfBirth
                    ),
                    listOf(
                        mapOf(
                            // Normally in another unit, backup in group 2
                            fri to
                                UnitAttendanceReservations.ChildRecordOfDay(
                                    reservation = null,
                                    attendance = null,
                                    absence = null,
                                    dailyServiceTimes =
                                        DailyServiceTimesValue.RegularTimes(
                                            monFri.asDateRange(),
                                            TimeRange(LocalTime.of(8, 0), LocalTime.of(16, 0))
                                        ),
                                    inOtherUnit = false,
                                    isInBackupGroup = false
                                )
                        )
                    )
                )
            ),
            group2.children.sortedBy { it.child.lastName }
        )

        // Ungrouped
        assertEquals(
            listOf(
                UnitAttendanceReservations.ChildDailyRecords(
                    UnitAttendanceReservations.Child(
                        testChild_4.id,
                        testChild_4.firstName,
                        testChild_4.lastName,
                        testChild_4.preferredName,
                        testChild_4.dateOfBirth
                    ),
                    listOf(emptyChildRecords(FiniteDateRange(wed, fri)))
                )
            ),
            attendanceReservations.ungrouped.sortedBy { it.child.lastName }
        )
    }

    @Test
    fun `two reservations or attendances in the same day`() {
        db.transaction { tx ->
            val child1PlacementId =
                tx.insertTestPlacement(
                    childId = testChild_1.id,
                    unitId = testDaycare.id,
                    startDate = mon,
                    endDate = fri
                )
            tx.insertTestDaycareGroupPlacement(
                daycarePlacementId = child1PlacementId,
                groupId = testGroup1.id,
                startDate = mon,
                endDate = fri
            )
            listOf(
                    DevReservation(
                        childId = testChild_1.id,
                        date = mon,
                        startTime = LocalTime.of(19, 0),
                        endTime = LocalTime.of(23, 59),
                        createdBy = EvakaUserId(employeeId.raw)
                    ),
                    DevReservation(
                        childId = testChild_1.id,
                        date = tue,
                        startTime = LocalTime.of(0, 0),
                        endTime = LocalTime.of(8, 0),
                        createdBy = EvakaUserId(employeeId.raw)
                    ),
                    DevReservation(
                        childId = testChild_1.id,
                        date = tue,
                        startTime = LocalTime.of(17, 30),
                        endTime = LocalTime.of(23, 59),
                        createdBy = EvakaUserId(employeeId.raw)
                    ),
                    DevReservation(
                        childId = testChild_1.id,
                        date = wed,
                        startTime = LocalTime.of(0, 0),
                        endTime = LocalTime.of(9, 30),
                        createdBy = EvakaUserId(employeeId.raw)
                    )
                )
                .forEach { tx.insertTestReservation(it) }

            listOf(
                    Pair(
                        HelsinkiDateTime.of(mon, LocalTime.of(19, 10)),
                        HelsinkiDateTime.of(mon, LocalTime.of(23, 59))
                    ),
                    Pair(
                        HelsinkiDateTime.of(tue, LocalTime.of(0, 0)),
                        HelsinkiDateTime.of(tue, LocalTime.of(10, 30))
                    ),
                    Pair(HelsinkiDateTime.of(tue, LocalTime.of(17, 0)), null)
                )
                .forEach {
                    tx.insertTestChildAttendance(
                        childId = testChild_1.id,
                        unitId = testDaycare.id,
                        arrived = it.first,
                        departed = it.second
                    )
                }
        }

        val attendanceReservations = getAttendanceReservations()

        val group1 = attendanceReservations.groups.find { it.group.id == testGroup1.id }!!
        assertEquals(
            listOf(
                UnitAttendanceReservations.ChildDailyRecords(
                    UnitAttendanceReservations.Child(
                        testChild_1.id,
                        testChild_1.firstName,
                        testChild_1.lastName,
                        testChild_1.preferredName,
                        testChild_1.dateOfBirth
                    ),
                    listOf(
                        emptyChildRecords(monFri) +
                            mapOf(
                                mon to
                                    UnitAttendanceReservations.ChildRecordOfDay(
                                        reservation =
                                            UnitAttendanceReservations.ReservationTimes(
                                                "19:00",
                                                "23:59"
                                            ),
                                        attendance =
                                            UnitAttendanceReservations.AttendanceTimes(
                                                "19:10",
                                                "23:59"
                                            ),
                                        absence = null,
                                        dailyServiceTimes = null,
                                        inOtherUnit = false,
                                        isInBackupGroup = false
                                    ),
                                tue to
                                    UnitAttendanceReservations.ChildRecordOfDay(
                                        reservation =
                                            UnitAttendanceReservations.ReservationTimes(
                                                "00:00",
                                                "08:00"
                                            ),
                                        attendance =
                                            UnitAttendanceReservations.AttendanceTimes(
                                                "00:00",
                                                "10:30"
                                            ),
                                        absence = null,
                                        dailyServiceTimes = null,
                                        inOtherUnit = false,
                                        isInBackupGroup = false
                                    ),
                                wed to
                                    UnitAttendanceReservations.ChildRecordOfDay(
                                        reservation =
                                            UnitAttendanceReservations.ReservationTimes(
                                                "00:00",
                                                "09:30"
                                            ),
                                        attendance = null,
                                        absence = null,
                                        dailyServiceTimes = null,
                                        inOtherUnit = false,
                                        isInBackupGroup = false
                                    )
                            ),

                        // Second daily entries go to another map
                        emptyChildRecords(monFri) +
                            mapOf(
                                tue to
                                    UnitAttendanceReservations.ChildRecordOfDay(
                                        reservation =
                                            UnitAttendanceReservations.ReservationTimes(
                                                "17:30",
                                                "23:59"
                                            ),
                                        attendance =
                                            UnitAttendanceReservations.AttendanceTimes(
                                                "17:00",
                                                null
                                            ),
                                        absence = null,
                                        dailyServiceTimes = null,
                                        inOtherUnit = false,
                                        isInBackupGroup = false
                                    )
                            )
                    )
                )
            ),
            group1.children.sortedBy { it.child.lastName }
        )

        assertEquals(emptyList(), attendanceReservations.ungrouped)
    }

    private fun emptyChildRecords(
        period: FiniteDateRange
    ): Map<LocalDate, UnitAttendanceReservations.ChildRecordOfDay> =
        period
            .dates()
            .map {
                it to
                    UnitAttendanceReservations.ChildRecordOfDay(
                        reservation = null,
                        attendance = null,
                        absence = null,
                        dailyServiceTimes = null,
                        inOtherUnit = false,
                        isInBackupGroup = false
                    )
            }
            .toMap()

    private fun getAttendanceReservations(): UnitAttendanceReservations =
        attendanceReservationController.getAttendanceReservations(
            dbInstance(),
            AuthenticatedUser.Employee(employeeId, setOf(UserRole.STAFF)),
            clock,
            testDaycare.id,
            from = mon,
            to = fri
        )
}
