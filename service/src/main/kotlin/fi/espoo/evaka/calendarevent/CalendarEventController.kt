// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.calendarevent

import fi.espoo.evaka.Audit
import fi.espoo.evaka.backupcare.getBackupCareChildrenInGroup
import fi.espoo.evaka.daycare.getDaycareGroups
import fi.espoo.evaka.placement.getDaycarePlacements
import fi.espoo.evaka.placement.getGroupPlacementChildren
import fi.espoo.evaka.shared.CalendarEventId
import fi.espoo.evaka.shared.CalendarEventTimeId
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.GroupId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.BadRequest
import fi.espoo.evaka.shared.domain.Conflict
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.NotFound
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

@RestController
class CalendarEventController(private val accessControl: AccessControl) {
    @GetMapping("/units/{unitId}/calendar-events")
    fun getUnitCalendarEvents(
        db: Database,
        user: AuthenticatedUser,
        clock: EvakaClock,
        @PathVariable unitId: DaycareId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) start: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) end: LocalDate
    ): List<CalendarEvent> {
        if (start.isAfter(end)) {
            throw BadRequest("Start must be before or equal to the end")
        }

        val range = FiniteDateRange(start, end)

        if (range.durationInDays() > 6 * 7) {
            throw BadRequest("Only 6 weeks of calendar events may be fetched at once")
        }

        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Unit.READ_CALENDAR_EVENTS,
                        unitId
                    )
                    tx.getCalendarEventsByUnit(unitId, range)
                }
            }
            .also {
                Audit.UnitCalendarEventsRead.log(
                    targetId = unitId,
                    meta = mapOf("start" to start, "end" to end, "count" to it.size)
                )
            }
    }

    @GetMapping("/units/{unitId}/groups/{groupId}/discussion-surveys")
    fun getGroupCalendarEventsWithTimes(
        db: Database,
        user: AuthenticatedUser,
        clock: EvakaClock,
        @PathVariable unitId: DaycareId,
        @PathVariable groupId: GroupId
    ): List<CalendarEvent> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Unit.READ_CALENDAR_EVENTS,
                        unitId
                    )
                    tx.getCalendarEventsByGroup(groupId).filter { calendarEvent ->
                        calendarEvent.times.isNotEmpty()
                    }
                }
            }
            .also {
                Audit.GroupCalendarEventsRead.log(
                    targetId = groupId,
                    meta = mapOf("count" to it.size)
                )
            }
    }

    @PostMapping("/calendar-event")
    fun createCalendarEvent(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestBody body: CalendarEventForm
    ): CalendarEventId {
        val eventId =
            db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Unit.CREATE_CALENDAR_EVENT,
                        body.unitId
                    )

                    if (body.tree != null) {
                        accessControl.requirePermissionFor(
                            tx,
                            user,
                            clock,
                            Action.Group.CREATE_CALENDAR_EVENT,
                            body.tree.keys
                        )

                        val unitGroupIds =
                            tx.getDaycareGroups(body.unitId, body.period.start, body.period.end)

                        if (
                            body.tree.keys.any { groupId ->
                                !unitGroupIds.any { unitGroup -> unitGroup.id == groupId }
                            }
                        ) {
                            throw BadRequest("Group ID is not of the specified unit's")
                        }

                        body.tree.forEach { (groupId, childIds) ->
                            if (childIds != null) {
                                val groupChildIds =
                                    tx.getGroupPlacementChildren(groupId, body.period)
                                val backupCareChildren =
                                    tx.getBackupCareChildrenInGroup(
                                        body.unitId,
                                        groupId,
                                        body.period
                                    )

                                if (
                                    childIds.any {
                                        !groupChildIds.contains(it) &&
                                            !backupCareChildren.contains(it)
                                    }
                                ) {
                                    throw BadRequest("Child is not placed into the selected group")
                                }
                            }
                        }
                    }

                    tx.createCalendarEvent(body, clock.now(), user.evakaUserId)
                }
            }
        Audit.CalendarEventCreate.log(targetId = body.unitId, objectId = eventId)
        return eventId
    }

    @GetMapping("/calendar-event/{id}")
    fun getCalendarEvent(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable id: CalendarEventId
    ): CalendarEvent {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.CalendarEvent.READ,
                        id
                    )
                    tx.getCalendarEventById(id) ?: throw NotFound()
                }
            }
            .also { Audit.CalendarEventRead.log(targetId = id) }
    }

    @DeleteMapping("/calendar-event/{id}")
    fun deleteCalendarEvent(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable id: CalendarEventId
    ) {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.CalendarEvent.DELETE,
                        id
                    )
                    tx.deleteCalendarEvent(id)
                }
            }
            .also { Audit.CalendarEventDelete.log(targetId = id) }
    }

    @PatchMapping("/calendar-event/{id}")
    fun modifyCalendarEvent(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable id: CalendarEventId,
        @RequestBody body: CalendarEventUpdateForm
    ) {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.CalendarEvent.UPDATE,
                        id
                    )
                    tx.updateCalendarEvent(id, clock.now(), body)
                }
            }
            .also { Audit.CalendarEventUpdate.log(targetId = id) }
    }

    @PutMapping("/calendar-event/{id}")
    fun updateCalendarEvent(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable id: CalendarEventId,
        @RequestBody body: CalendarEventUpdateForm
    ) {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.CalendarEvent.UPDATE,
                        id
                    )
                    val event = tx.getCalendarEventById(id) ?: throw NotFound()
                    val current = tx.getCalendarEventChildIds(event.id)
                    val updated = resolveAttendeeChildIds(tx, event.unitId, body.tree, event.period)
                    val removed = current.minus(updated.toSet())
                    removed.forEach { childId ->
                        tx.deleteCalendarEventTimeReservations(
                            calendarEventId = event.id,
                            childId = childId
                        )
                    }
                    tx.updateCalendarEventWithPeriod(id, clock.now(), body)
                    tx.deleteCalendarEventAttendees(id)
                    tx.createCalendarEventAttendees(id, event.unitId, body.tree)
                }
            }
            .also { Audit.CalendarEventUpdate.log(targetId = id) }
    }

    @PostMapping("/calendar-event/{id}/time")
    fun addCalendarEventTime(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable id: CalendarEventId,
        @RequestBody body: CalendarEventTimeForm
    ): CalendarEventTimeId {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.CalendarEvent.UPDATE,
                        id
                    )
                    val cetId = tx.createCalendarEventTime(id, body, clock.now(), user.evakaUserId)
                    tx.setCalendarEventContentModifiedAt(id, clock.now())
                    cetId
                }
            }
            .also { Audit.CalendarEventTimeCreate.log(targetId = id) }
    }

    @DeleteMapping("/calendar-event-time/{id}")
    fun deleteCalendarEventTime(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable id: CalendarEventTimeId
    ) {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.CalendarEventTime.DELETE,
                        id
                    )
                    val calendarEventId = tx.getCalendarEventIdByTimeId(id)
                    tx.setCalendarEventContentModifiedAt(calendarEventId!!, clock.now())
                    tx.deleteCalendarEventTime(id)
                }
            }
            .also { Audit.CalendarEventTimeDelete.log(targetId = id) }
    }

    @PostMapping("/calendar-event/reservation")
    fun setCalendarEventTimeReservation(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestBody body: CalendarEventTimeReservationForm
    ) {
        return db.connect { dbc ->
            dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.CalendarEventTime.UPDATE_RESERVATION,
                        body.calendarEventTimeId
                    )
                    validate(tx, body)
                    tx.deleteCalendarEventTimeReservation(
                        calendarEventTimeId = body.calendarEventTimeId,
                        childId = null
                    )
                    tx.insertCalendarEventTimeReservation(body, clock.now(), user.evakaUserId)
                }
                .also { Audit.CalendarEventTimeReservationUpdate.log(targetId = body) }
        }
    }

    @GetMapping("/citizen/calendar-events")
    fun getCitizenCalendarEvents(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) start: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) end: LocalDate
    ): List<CitizenCalendarEvent> {
        if (start.isAfter(end)) {
            throw BadRequest("Start must be before or equal to the end")
        }

        val range = FiniteDateRange(start, end)

        if (range.durationInDays() > 450) {
            throw BadRequest("Only 450 days of calendar events may be fetched at once")
        }

        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Person.READ_CALENDAR_EVENTS,
                        user.id
                    )
                    tx.getCalendarEventsForGuardian(user.id, range)
                        .groupBy { it.id }
                        .map { (eventId, attendees) ->
                            CitizenCalendarEvent(
                                id = eventId,
                                title = attendees[0].title,
                                description = attendees[0].description,
                                attendingChildren =
                                    attendees
                                        .groupBy { it.childId }
                                        .mapValues { (_, attendee) ->
                                            attendee
                                                .groupBy { Triple(it.type, it.groupId, it.unitId) }
                                                .map { (t, attendance) ->
                                                    AttendingChild(
                                                        periods = attendance.map { it.period },
                                                        type = t.first,
                                                        groupName = attendance[0].groupName,
                                                        unitName = attendance[0].unitName
                                                    )
                                                }
                                        }
                            )
                        }
                }
            }
            .also {
                Audit.UnitCalendarEventsRead.log(
                    targetId = user.id,
                    meta = mapOf("start" to start, "end" to end, "count" to it.size)
                )
            }
    }

    @GetMapping("/citizen/calendar-event/{eventId}/time")
    fun getReservableCalendarEventTimes(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable eventId: CalendarEventId,
        @RequestParam childId: ChildId
    ): List<CalendarEventTime> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.CalendarEvent.READ,
                        eventId
                    )
                    tx.getReservableCalendarEventTimes(eventId, childId)
                }
            }
            .also {
                Audit.CalendarEventTimeRead.log(
                    targetId = eventId,
                    objectId = mapOf("childId" to childId)
                )
            }
    }

    @PostMapping("/citizen/calendar-event/reservation")
    fun addCalendarEventTimeReservation(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @RequestBody body: CalendarEventTimeReservationForm
    ) {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Child.CREATE_CALENDAR_EVENT_TIME_RESERVATION,
                        body.childId
                    )
                    validate(tx, body)
                    val count =
                        tx.insertCalendarEventTimeReservation(body, clock.now(), user.evakaUserId)
                    if (count != 1) {
                        throw Conflict("Calendar event time already reserved")
                    }
                }
            }
            .also { Audit.CalendarEventTimeReservationCreate.log(targetId = body) }
    }

    @DeleteMapping("/citizen/calendar-event/reservation")
    fun deleteCalendarEventTimeReservation(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @RequestParam calendarEventTimeId: CalendarEventTimeId,
        @RequestParam childId: ChildId
    ) {
        val body = CalendarEventTimeReservationForm(calendarEventTimeId, childId)
        db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Child.DELETE_CALENDAR_EVENT_TIME_RESERVATION,
                        body.childId
                    )
                    tx.deleteCalendarEventTimeReservation(
                        calendarEventTimeId = body.calendarEventTimeId,
                        childId = body.childId
                    )
                }
            }
            .also { Audit.CalendarEventTimeReservationDelete.log(targetId = body) }
    }
}

private fun validate(tx: Database.Read, body: CalendarEventTimeReservationForm) {
    val calendarEventId =
        tx.getCalendarEventIdByTimeId(body.calendarEventTimeId)
            ?: throw BadRequest("Calendar event time not found")
    if (!tx.getCalendarEventChildIds(calendarEventId).contains(body.childId)) {
        throw BadRequest("Child ${body.childId} is not attendee in calendar event")
    }
}

private fun resolveAttendeeChildIds(
    tx: Database.Read,
    unitId: DaycareId,
    tree: Map<GroupId, Set<ChildId>?>?,
    range: FiniteDateRange
): List<ChildId> {
    return tree?.flatMap {
        if (it.value != null) it.value!!.toList() else tx.getGroupPlacementChildren(it.key, range)
    }
        ?: tx.getDaycarePlacements(
                daycareId = unitId,
                childId = null,
                startDate = range.start,
                endDate = range.end
            )
            .map { placement -> placement.child.id }
}
