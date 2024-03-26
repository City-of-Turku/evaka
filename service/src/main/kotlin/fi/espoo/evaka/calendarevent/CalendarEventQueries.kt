// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.calendarevent

import fi.espoo.evaka.daycare.domain.Language
import fi.espoo.evaka.emailclient.CalendarEventNotificationData
import fi.espoo.evaka.shared.CalendarEventId
import fi.espoo.evaka.shared.CalendarEventTimeId
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.EvakaUserId
import fi.espoo.evaka.shared.GroupId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime

fun Database.Read.getCalendarEventsByUnit(
    unitId: DaycareId,
    range: FiniteDateRange
): List<CalendarEvent> =
    getCalendarEventsQuery(unitId = unitId, range = range).toList<CalendarEvent>()

private fun Database.Read.getCalendarEventsQuery(
    calendarEventId: CalendarEventId? = null,
    unitId: DaycareId? = null,
    range: FiniteDateRange? = null,
    groupId: GroupId? = null,
    eventTypes: List<CalendarEventType>? = emptyList()
) =
    @Suppress("DEPRECATION")
    this.createQuery(
            """
SELECT
    ce.id, cea.unit_id, ce.title, ce.description, ce.period, ce.content_modified_at, ce.event_type,
    (
        coalesce(jsonb_agg(DISTINCT jsonb_build_object(
            'id', cea.group_id,
            'name', dg.name
        )) FILTER (WHERE cea.group_id IS NOT NULL), '[]'::jsonb)
    ) AS groups,
    (
        coalesce(jsonb_agg(DISTINCT jsonb_build_object(
            'id', cea.child_id,
            'firstName', p.first_name,
            'lastName', p.last_name,
            'groupId', cea.group_id
        )) FILTER (WHERE cea.child_id IS NOT NULL), '[]'::jsonb)
    ) AS individual_children,
    (
        coalesce(jsonb_agg(DISTINCT jsonb_build_object(
            'id', cet.id,
            'date', cet.date,
            'startTime', cet.start_time,
            'endTime', cet.end_time,
            'childId', cet.child_id
        )) FILTER (WHERE cet.id IS NOT NULL), '[]'::jsonb)
    ) AS times
FROM calendar_event_attendee cea
JOIN calendar_event ce ON cea.calendar_event_id = ce.id
LEFT JOIN daycare_group dg ON dg.id = cea.group_id
LEFT JOIN person p ON p.id = cea.child_id
LEFT JOIN calendar_event_time cet ON cet.calendar_event_id = ce.id
WHERE (:calendarEventId IS NULL OR ce.id = :calendarEventId) 
AND (:unitId IS NULL OR cea.unit_id = :unitId) 
AND (:groupId IS NULL OR cea.group_id = :groupId)
AND (:range IS NULL OR ce.period && :range)
AND (:eventTypes::calendar_event_type[] = '{}' OR ce.event_type = ANY(:eventTypes::calendar_event_type[]))
AND (cea.child_id IS NULL OR EXISTS(
    -- filter out attendees that haven't been placed in the specified unit/group,
    -- for example due to changes in placements after the event creation or a new backup care
    SELECT 1 FROM generate_series(lower(ce.period), upper(ce.period) - INTERVAL '1 day', '1 day') d
    JOIN realized_placement_one(d::date) rp ON true
    WHERE rp.child_id = cea.child_id
      AND (cea.group_id IS NULL OR rp.group_id = cea.group_id)
      AND rp.unit_id = cea.unit_id
))
GROUP BY ce.id, cea.unit_id
        """
                .trimIndent()
        )
        .bind("calendarEventId", calendarEventId)
        .bind("unitId", unitId)
        .bind("groupId", groupId)
        .bind("range", range)
        .bind("eventTypes", eventTypes)

fun Database.Transaction.createCalendarEvent(
    event: CalendarEventForm,
    createdAt: HelsinkiDateTime,
    createdBy: EvakaUserId
): CalendarEventId {
    val eventId =
        @Suppress("DEPRECATION")
        this.createUpdate(
                """
INSERT INTO calendar_event (created_at, title, description, period, modified_at, content_modified_at, event_type)
VALUES (:createdAt, :title, :description, :period, :createdAt, :createdAt, :eventType)
RETURNING id
        """
                    .trimIndent()
            )
            .bind("createdAt", createdAt)
            .bindKotlin(event)
            .executeAndReturnGeneratedKeys()
            .exactlyOne<CalendarEventId>()

    createCalendarEventAttendees(eventId, event.unitId, event.tree)

    if (event.eventType == CalendarEventType.DISCUSSION_SURVEY && !event.times.isNullOrEmpty()) {
        event.times.forEach { time -> createCalendarEventTime(eventId, time, createdAt, createdBy) }
    }

    return eventId
}

fun Database.Transaction.createCalendarEventAttendees(
    eventId: CalendarEventId,
    unitId: DaycareId,
    tree: Map<GroupId, Set<ChildId>?>?
) {
    if (tree != null) {
        val batch =
            prepareBatch(
                """
            INSERT INTO calendar_event_attendee (calendar_event_id, unit_id, group_id, child_id)
            VALUES (:eventId, :unitId, :groupId, :childId)
        """
                    .trimIndent()
            )
        tree.forEach { (groupId, childIds) ->
            if (childIds != null) {
                childIds.forEach { childId ->
                    batch
                        .bind("eventId", eventId)
                        .bind("unitId", unitId)
                        .bind("groupId", groupId)
                        .bind("childId", childId)
                        .add()
                }
            } else {
                val childId: ChildId? = null
                batch
                    .bind("eventId", eventId)
                    .bind("unitId", unitId)
                    .bind("groupId", groupId)
                    .bind("childId", childId)
                    .add()
            }
        }
        batch.execute()
    } else {
        createCalendarEventAttendee(eventId, unitId, null, null)
    }
}

fun Database.Transaction.deleteCalendarEventAttendees(eventId: CalendarEventId) =
    @Suppress("DEPRECATION")
    createUpdate("DELETE FROM calendar_event_attendee WHERE calendar_event_id = :eventId")
        .bind("eventId", eventId)
        .execute()

fun Database.Read.getReservableCalendarEventTimes(
    calendarEventId: CalendarEventId,
    childId: ChildId
) =
    @Suppress("DEPRECATION")
    createQuery(
            """
SELECT id, date, start_time, end_time
FROM calendar_event_time
WHERE calendar_event_id = :calendarEventId
AND (child_id IS NULL OR child_id = :childId)
"""
        )
        .bind("calendarEventId", calendarEventId)
        .bind("childId", childId)
        .toList<CalendarEventTime>()

fun Database.Transaction.createCalendarEventTime(
    calendarEventId: CalendarEventId,
    time: CalendarEventTimeForm,
    createdAt: HelsinkiDateTime,
    createdBy: EvakaUserId
) =
    @Suppress("DEPRECATION")
    createUpdate(
            """
INSERT INTO calendar_event_time (created_at, created_by, updated_at, modified_at, modified_by, calendar_event_id, date, start_time, end_time)
VALUES (:createdAt, :createdBy, :createdAt, :createdAt, :createdBy, :calendarEventId, :date, :startTime, :endTime)
RETURNING id
"""
        )
        .bind("createdAt", createdAt)
        .bind("createdBy", createdBy)
        .bind("calendarEventId", calendarEventId)
        .bind("date", time.date)
        .bind("startTime", time.timeRange.start)
        .bind("endTime", time.timeRange.end)
        .executeAndReturnGeneratedKeys()
        .mapTo<CalendarEventTimeId>()
        .exactlyOne()

fun Database.Transaction.deleteCalendarEventTime(id: CalendarEventTimeId) =
    @Suppress("DEPRECATION")
    createUpdate("DELETE FROM calendar_event_time WHERE id = :id").bind("id", id).updateExactlyOne()

fun Database.Read.getCalendarEventById(id: CalendarEventId) =
    getCalendarEventsQuery(calendarEventId = id).exactlyOneOrNull<CalendarEvent>()

fun Database.Read.getCalendarEventsByGroupAndType(
    groupId: GroupId,
    eventTypes: List<CalendarEventType>
) = getCalendarEventsQuery(groupId = groupId, eventTypes = eventTypes).toList<CalendarEvent>()

fun Database.Read.getCalendarEventsByUnitWithRange(unitId: DaycareId, range: FiniteDateRange) =
    getCalendarEventsQuery(unitId = unitId, range = range).toList<CalendarEvent>()

fun Database.Transaction.deleteCalendarEvent(eventId: CalendarEventId) =
    @Suppress("DEPRECATION")
    this.createUpdate(
            """
DELETE FROM calendar_event WHERE id = :id
        """
                .trimIndent()
        )
        .bind("id", eventId)
        .updateExactlyOne()

fun Database.Transaction.createCalendarEventAttendee(
    eventId: CalendarEventId,
    unitId: DaycareId,
    groupId: GroupId?,
    childId: ChildId?
) =
    @Suppress("DEPRECATION")
    this.createUpdate(
            """
INSERT INTO calendar_event_attendee (calendar_event_id, unit_id, group_id, child_id)
VALUES (:eventId, :unitId, :groupId, :childId)
        """
                .trimIndent()
        )
        .bind("eventId", eventId)
        .bind("unitId", unitId)
        .bind("groupId", groupId)
        .bind("childId", childId)
        .updateExactlyOne()

fun Database.Read.getCalendarEventIdByTimeId(id: CalendarEventTimeId) =
    @Suppress("DEPRECATION")
    createQuery("SELECT calendar_event_id FROM calendar_event_time WHERE id = :id")
        .bind("id", id)
        .exactlyOneOrNull<CalendarEventId>()

fun Database.Read.getCalendarEventChildIds(calendarEventId: CalendarEventId) =
    @Suppress("DEPRECATION")
    createQuery(
            """
SELECT child_id
FROM calendar_event_attendee_child_view
WHERE calendar_event_id = :calendarEventId
"""
        )
        .bind("calendarEventId", calendarEventId)
        .toList<ChildId>()

fun Database.Transaction.updateCalendarEvent(
    eventId: CalendarEventId,
    modifiedAt: HelsinkiDateTime,
    updateForm: CalendarEventUpdateForm
) =
    @Suppress("DEPRECATION")
    this.createUpdate(
            """
UPDATE calendar_event
SET title = :title, description = :description, modified_at = :modifiedAt, content_modified_at = :modifiedAt
WHERE id = :eventId
        """
                .trimIndent()
        )
        .bind("eventId", eventId)
        .bind("modifiedAt", modifiedAt)
        .bindKotlin(updateForm)
        .updateExactlyOne()

fun Database.Transaction.insertCalendarEventTimeReservation(
    eventTimeId: CalendarEventTimeId,
    childId: ChildId?,
    modifiedAt: HelsinkiDateTime,
    modifiedBy: EvakaUserId
) =
    @Suppress("DEPRECATION")
    createUpdate(
            """
UPDATE calendar_event_time
SET child_id = :childId, modified_at = :modifiedAt, modified_by = :modifiedBy
WHERE id = :calendarEventTimeId AND (child_id IS NULL OR child_id = :childId)
"""
        )
        .bind("calendarEventTimeId", eventTimeId)
        .bind("childId", childId)
        .bind("modifiedAt", modifiedAt)
        .bind("modifiedBy", modifiedBy)
        .updateNoneOrOne()

fun Database.Transaction.deleteCalendarEventTimeReservations(
    calendarEventId: CalendarEventId,
    childId: ChildId
) =
    @Suppress("DEPRECATION")
    createUpdate(
            """
UPDATE calendar_event_time
SET child_id = NULL::uuid
WHERE calendar_event_id = :calendarEventId
AND child_id = :childId
"""
        )
        .bind("calendarEventId", calendarEventId)
        .bind("childId", childId)
        .execute()

fun Database.Transaction.deleteCalendarEventTimeReservation(
    calendarEventTimeId: CalendarEventTimeId,
    childId: ChildId?
) =
    @Suppress("DEPRECATION")
    createUpdate(
            """
UPDATE calendar_event_time
SET child_id = NULL::uuid
WHERE id = :calendarEventTimeId
"""
        )
        .bind("calendarEventTimeId", calendarEventTimeId)
        .bind("childId", childId)
        .execute()

data class CitizenCalendarEventRow(
    val id: CalendarEventId,
    val childId: ChildId,
    val period: FiniteDateRange,
    val title: String,
    val description: String,
    val type: String,
    val groupId: GroupId?,
    val groupName: String?,
    val unitId: DaycareId,
    val unitName: String
)

fun Database.Read.getCalendarEventsForGuardian(
    guardianId: PersonId,
    range: FiniteDateRange
): List<CitizenCalendarEventRow> =
    @Suppress("DEPRECATION")
    this.createQuery(
            """
WITH child AS NOT MATERIALIZED (
    SELECT g.child_id id FROM guardian g WHERE g.guardian_id = :guardianId
    UNION
    SELECT fp.child_id FROM foster_parent fp WHERE parent_id = :guardianId AND valid_during && :range
),
child_placement AS NOT MATERIALIZED (
    SELECT p.id, p.unit_id, p.child_id, placement_without_backup.range period, null backup_group_id
    FROM placement p
    LEFT JOIN LATERAL (
        -- remove all backup care placements from the placement's range; this may result in
        -- multiple ranges (if the backup care is in the middle of the actual placement)
        SELECT range
        FROM unnest(
            datemultirange(daterange(p.start_date, p.end_date, '[]')) - (
                SELECT coalesce(range_agg(daterange(bc.start_date, bc.end_date, '[]')), datemultirange())
                FROM backup_care bc
                WHERE p.child_id = bc.child_id
                  AND daterange(bc.start_date, bc.end_date, '[]') && daterange(p.start_date, p.end_date, '[]')
            )
        ) range
    ) placement_without_backup ON true
    WHERE EXISTS(SELECT 1 FROM child WHERE p.child_id = child.id)
      AND placement_without_backup.range IS NOT NULL
      AND daterange(p.start_date, p.end_date, '[]') && :range
      
    UNION ALL
    
    -- add backup cares
    SELECT null id, bc.unit_id, bc.child_id, daterange(bc.start_date, bc.end_date, '[]') period, bc.group_id backup_group_id
    FROM backup_care bc
    WHERE EXISTS(SELECT 1 FROM child WHERE bc.child_id = child.id)
      AND daterange(bc.start_date, bc.end_date, '[]') && :range
)
SELECT ce.id, cp.child_id, ce.period * daterange(dgp.start_date, dgp.end_date, '[]') * cp.period period, ce.title, ce.description, (
    CASE WHEN cea.child_id IS NOT NULL THEN 'individual'
         WHEN cea.group_id IS NOT NULL THEN 'group'
         ELSE 'unit' END
) type, dg.id group_id, dg.name group_name, unit.id unit_id, unit.name unit_name
FROM child_placement cp
LEFT JOIN daycare_group_placement dgp ON cp.backup_group_id IS NULL AND dgp.daycare_placement_id = cp.id
LEFT JOIN calendar_event_attendee cea
    ON cea.unit_id = cp.unit_id
    AND (cea.child_id IS NULL OR cea.child_id = cp.child_id)
    AND (cea.group_id IS NULL OR cea.group_id = coalesce(cp.backup_group_id, dgp.daycare_group_id))
JOIN calendar_event ce ON ce.id = cea.calendar_event_id
LEFT JOIN daycare_group dg ON dg.id = cea.group_id
LEFT JOIN daycare unit ON unit.id = cea.unit_id
WHERE cp.period && ce.period
  AND ce.period && :range
  AND daterange(dgp.start_date, dgp.end_date, '[]') && ce.period
  AND daterange(dgp.start_date, dgp.end_date, '[]') && cp.period
        """
                .trimIndent()
        )
        .bind("guardianId", guardianId)
        .bind("range", range)
        .toList<CitizenCalendarEventRow>()

fun Database.Read.devCalendarEventUnitAttendeeCount(unitId: DaycareId): Int =
    @Suppress("DEPRECATION")
    this.createQuery(
            """
SELECT COUNT(*) FROM calendar_event_attendee WHERE unit_id = :unitId
        """
                .trimIndent()
        )
        .bind("unitId", unitId)
        .exactlyOne<Int>()

data class ParentWithEvents(
    val parentId: PersonId,
    val language: Language,
    val events: List<CalendarEventNotificationData>
)

fun Database.Read.getParentsWithNewEventsAfter(cutoff: HelsinkiDateTime): List<ParentWithEvents> {
    return createQuery {
            sql(
                """
WITH matching_events AS (
    SELECT id, period FROM calendar_event WHERE created_at >= ${bind(cutoff)}
), matching_children AS (
    SELECT ce.id AS event_id, ce.period * daterange(pl.start_date, pl.end_date, '[]') AS period, pl.child_id
    FROM matching_events ce
    JOIN calendar_event_attendee cea ON cea.calendar_event_id = ce.id
    JOIN placement pl ON pl.unit_id = cea.unit_id AND daterange(pl.start_date, pl.end_date, '[]') && ce.period
    WHERE
        -- Affects the whole unit
        cea.group_id IS NULL AND
        cea.child_id IS NULL AND
        NOT EXISTS (
            SELECT 1 FROM backup_care bc
            WHERE
                bc.child_id = pl.child_id AND
                bc.unit_id <> pl.unit_id AND
                daterange(bc.start_date, bc.end_date, '[]') @> ce.period
        )

    UNION ALL

    SELECT ce.id AS event_id, ce.period * daterange(dgp.start_date, dgp.end_date, '[]') AS period, pl.child_id
    FROM matching_events ce
    JOIN calendar_event_attendee cea ON cea.calendar_event_id = ce.id
    JOIN daycare_group_placement dgp ON dgp.daycare_group_id = cea.group_id AND daterange(dgp.start_date, dgp.end_date, '[]') && ce.period
    JOIN placement pl ON pl.id = dgp.daycare_placement_id
    WHERE
        -- Affects a single group
        cea.group_id IS NOT NULL AND
        cea.child_id IS NULL AND
        NOT EXISTS (
            SELECT 1 FROM backup_care bc
            WHERE
                bc.child_id = pl.child_id AND
                (bc.group_id IS NULL OR bc.group_id <> dgp.daycare_group_id) AND
                daterange(bc.start_date, bc.end_date, '[]') @> ce.period
        )

    UNION ALL

    SELECT ce.id AS event_id, ce.period, cea.child_id
    FROM matching_events ce
    JOIN calendar_event_attendee cea ON cea.calendar_event_id = ce.id
    WHERE
        -- Affects a single child (in a single group)
        cea.group_id IS NOT NULL AND
        cea.child_id IS NOT NULL
        -- We don't filter out backup care here because the child was "hand-picked"
        -- to participate in this event
), matching_parents AS (
    -- List each event at most once per parent

    SELECT DISTINCT g.guardian_id AS parent_id, mc.event_id
    FROM matching_children mc
    JOIN guardian g ON g.child_id = mc.child_id

    UNION

    SELECT DISTINCT fp.parent_id, mc.event_id
    FROM matching_children mc
    JOIN foster_parent fp ON fp.child_id = mc.child_id AND fp.valid_during && mc.period
)
SELECT
    mp.parent_id,
    p.language,
    jsonb_agg(
        json_build_object(
            'title', ce.title,
            'period', json_build_object(
                'start', lower(ce.period),
                'end', upper(ce.period) - 1
            )
        )
        ORDER BY lower(ce.period)
    ) AS events
FROM matching_parents mp
JOIN person p ON p.id = mp.parent_id
JOIN calendar_event ce ON ce.id = mp.event_id
GROUP BY mp.parent_id, p.language
"""
            )
        }
        .toList {
            ParentWithEvents(
                parentId = column("parent_id"),
                language = Language.tryValueOf(column<String?>("language")) ?: Language.fi,
                events = jsonColumn<List<CalendarEventNotificationData>>("events")
            )
        }
}

fun Database.Transaction.updateCalendarEventPeriod(
    eventId: CalendarEventId,
    modifiedAt: HelsinkiDateTime,
    period: FiniteDateRange
) =
    this.createUpdate {
            sql(
                """
UPDATE calendar_event
SET period = :period, modified_at = :modifiedAt, content_modified_at = :modifiedAt
WHERE id = :eventId
        """
            )
        }
        .bind("eventId", eventId)
        .bind("modifiedAt", modifiedAt)
        .bind("period", period)
        .updateExactlyOne()
