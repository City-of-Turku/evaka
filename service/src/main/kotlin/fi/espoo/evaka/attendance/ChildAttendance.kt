// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.attendance

import fi.espoo.evaka.dailyservicetimes.DailyServiceTimes
import fi.espoo.evaka.daycare.service.AbsenceCareType
import fi.espoo.evaka.messaging.daycarydailynote.DaycareDailyNote
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.shared.AbsenceId
import fi.espoo.evaka.shared.AttendanceId
import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.GroupId
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import java.time.LocalDate
import java.util.UUID

data class ChildResult(
    val status: ChildResultStatus,
    val child: ChildSensitiveInformation? = null
)

enum class ChildResultStatus {
    SUCCESS, WRONG_PIN, PIN_LOCKED, NOT_FOUND
}

data class ChildSensitiveInformation(
    val id: UUID,
    val firstName: String,
    val lastName: String,
    val preferredName: String,
    val ssn: String,
    val childAddress: String,
    val placementTypes: List<PlacementType>,
    val allergies: String,
    val diet: String,
    val medication: String,
    val contacts: List<ContactInfo>,
    val backupPickups: List<ContactInfo>
)

data class ContactInfo(
    val id: String,
    val firstName: String,
    val lastName: String,
    val phone: String,
    val backupPhone: String,
    val email: String,
    val priority: Int?
)

data class AttendanceResponse(
    val unit: UnitInfo,
    val children: List<Child>
)

data class UnitInfo(
    val id: DaycareId,
    val name: String,
    val groups: List<GroupInfo>,
    val staff: List<Staff>
)

data class GroupInfo(
    val id: GroupId,
    val name: String,
    val dailyNote: DaycareDailyNote?
)

data class ChildBasics(
    val id: UUID,
    val firstName: String,
    val lastName: String,
    val preferredName: String?,
    val dateOfBirth: LocalDate,
    val dailyServiceTimes: DailyServiceTimes?,
    val placementType: PlacementType,
    val groupId: GroupId,
    val backup: Boolean,
    val imageUrl: String?
)

data class Child(
    val id: UUID,
    val firstName: String,
    val lastName: String,
    val preferredName: String?,
    val placementType: PlacementType,
    val groupId: GroupId,
    val backup: Boolean,
    val status: AttendanceStatus,
    val attendance: ChildAttendance?,
    val absences: List<ChildAbsence>,
    val dailyServiceTimes: DailyServiceTimes?,
    val dailyNote: DaycareDailyNote?,
    val imageUrl: String?,
    val reservation: AttendanceReservation?
)

enum class AttendanceStatus {
    COMING, PRESENT, DEPARTED, ABSENT
}

data class ChildAttendance(
    val id: AttendanceId,
    val childId: UUID,
    val unitId: DaycareId,
    val arrived: HelsinkiDateTime,
    val departed: HelsinkiDateTime?
)

data class ChildAbsence(
    val id: AbsenceId,
    val childId: UUID,
    val careType: AbsenceCareType
)

data class Staff(
    val id: UUID,
    val firstName: String,
    val lastName: String,
    val pinSet: Boolean = false,
    val groups: List<UUID>
)

data class AttendanceReservation(val startTime: String, val endTime: String)
