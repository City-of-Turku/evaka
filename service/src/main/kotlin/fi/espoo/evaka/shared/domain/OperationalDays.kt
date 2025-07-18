// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.shared.domain

import fi.espoo.evaka.daycare.PreschoolTerm
import fi.espoo.evaka.daycare.getPreschoolTerms
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.placement.getPlacementsForChildDuring
import fi.espoo.evaka.serviceneed.ShiftCareType
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.data.DateMap
import fi.espoo.evaka.shared.data.DateSet
import fi.espoo.evaka.shared.db.Database
import java.time.LocalDate

fun Database.Read.getOperationalDatesForChildren(
    range: FiniteDateRange,
    children: Set<ChildId>,
): Map<ChildId, Set<LocalDate>> {
    data class PlacementRange(
        val range: FiniteDateRange,
        val childId: ChildId,
        val unitId: DaycareId,
    )

    val placements: Map<ChildId, DateMap<DaycareId>> =
        createQuery {
                sql(
                    """
        SELECT daterange(pl.start_date, pl.end_date, '[]') as range, pl.child_id, pl.unit_id
        FROM placement pl
        WHERE pl.child_id = ANY(${bind(children)}) AND daterange(pl.start_date, pl.end_date, '[]') && ${bind(range)}
    """
                )
            }
            .toList<PlacementRange>()
            .groupBy { it.childId }
            .mapValues { entry -> DateMap.of(entry.value.map { it.range to it.unitId }) }

    val backupPlacements: Map<ChildId, DateMap<DaycareId>> =
        createQuery {
                sql(
                    """
        SELECT daterange(bc.start_date, bc.end_date, '[]') as range, bc.child_id, bc.unit_id
        FROM backup_care bc
        WHERE bc.child_id = ANY(${bind(children)}) AND daterange(bc.start_date, bc.end_date, '[]') && ${bind(range)}
    """
                )
            }
            .toList<PlacementRange>()
            .groupBy { it.childId }
            .mapValues { entry -> DateMap.of(entry.value.map { it.range to it.unitId }) }

    val realizedPlacements: Map<ChildId, DateMap<DaycareId>> =
        placements.mapValues { (childId, placementDateMap) ->
            val backupDateMap = backupPlacements[childId] ?: return@mapValues placementDateMap
            placementDateMap.setAll(backupDateMap)
        }

    val daycareIds =
        realizedPlacements.values.flatMap { dateMap -> dateMap.entries().map { it.second } }.toSet()

    data class DaycareOperationDays(
        val unitId: DaycareId,
        val operationDays: Set<Int>,
        val shiftCareOperationDays: Set<Int>?,
        val shiftCareOpenOnHolidays: Boolean,
    )
    val operationDaysByDaycareId: Map<DaycareId, DaycareOperationDays> =
        createQuery {
                sql(
                    """
        SELECT id AS unit_id, operation_days, shift_care_operation_days, shift_care_open_on_holidays
        FROM daycare 
        WHERE id = ANY(${bind(daycareIds)})
    """
                )
            }
            .toList<DaycareOperationDays>()
            .associateBy { it.unitId }

    val holidays = getHolidays(range)

    data class ShiftCareRange(
        val childId: ChildId,
        val range: FiniteDateRange,
        val shiftCare: ShiftCareType,
    )
    val shiftCareRanges =
        createQuery {
                sql(
                    """
        SELECT pl.child_id, daterange(sn.start_date, sn.end_date, '[]') AS range, sn.shift_care
        FROM placement pl
        JOIN service_need sn ON sn.placement_id = pl.id AND sn.shift_care = ANY('{FULL,INTERMITTENT}'::shift_care_type[])
        WHERE pl.child_id = ANY(${bind(children)}) AND daterange(pl.start_date, pl.end_date, '[]') && ${bind(range)}
    """
                )
            }
            .toList<ShiftCareRange>()
            .groupBy { it.childId }

    val fullShiftCareRanges: Map<ChildId, DateSet> =
        shiftCareRanges.mapValues { entry ->
            DateSet.of(entry.value.filter { it.shiftCare == ShiftCareType.FULL }.map { it.range })
        }
    val intermittentShiftCareRanges: Map<ChildId, DateSet> =
        shiftCareRanges.mapValues { entry ->
            DateSet.of(
                entry.value.filter { it.shiftCare == ShiftCareType.INTERMITTENT }.map { it.range }
            )
        }

    return children.associate { childId ->
        val operationalDays =
            range.dates().filter { date ->
                val unitId = realizedPlacements[childId]?.getValue(date) ?: return@filter false
                if (intermittentShiftCareRanges[childId]?.includes(date) == true) {
                    return@filter true
                }
                val hasShiftCare = fullShiftCareRanges[childId]?.includes(date) ?: false
                val daycareOperationDays =
                    operationDaysByDaycareId[unitId]?.let {
                        it.shiftCareOperationDays?.takeIf { hasShiftCare } ?: it.operationDays
                    } ?: return@filter false
                if (!daycareOperationDays.contains(date.dayOfWeek.value)) {
                    return@filter false
                }
                if (holidays.contains(date)) {
                    return@filter hasShiftCare &&
                        (operationDaysByDaycareId[unitId]?.shiftCareOpenOnHolidays ?: false)
                }
                true
            }

        childId to operationalDays.toSet()
    }
}

fun Database.Read.getOperationalDatesForChild(
    range: FiniteDateRange,
    childId: ChildId,
): Set<LocalDate> = getOperationalDatesForChildren(range, setOf(childId))[childId] ?: emptySet()

fun Database.Read.getPreschoolOperationalDatesForChildren(
    range: FiniteDateRange,
    children: Set<ChildId>,
): Map<ChildId, Set<LocalDate>> =
    getPreschoolOperationalDatesForChildren(range, children, getPreschoolTerms())

fun Database.Read.getPreschoolOperationalDatesForChildren(
    range: FiniteDateRange,
    children: Set<ChildId>,
    allTerms: List<PreschoolTerm>,
): Map<ChildId, Set<LocalDate>> {
    val terms = allTerms.filter { it.extendedTerm.overlaps(range) }
    val operationalDates = DateSet.of(terms.map { it.extendedTerm }).intersection(listOf(range))
    if (operationalDates.isEmpty()) return children.associateWith { emptySet() }

    val breaks = terms.flatMap { it.termBreaks.ranges() }
    val weekends = range.dates().filter { it.isWeekend() }
    val holidays = getHolidays(range)
    val nonOperationalDates =
        DateSet.of(
            breaks +
                weekends.map { it.toFiniteDateRange() } +
                holidays.map { it.toFiniteDateRange() }
        )

    return children.associateWith { childId ->
        val placementRanges =
            getPlacementsForChildDuring(childId, range.start, range.end)
                .filter { PlacementType.preschool.contains(it.type) }
                .map { FiniteDateRange(it.startDate, it.endDate) }
        DateSet.of(placementRanges)
            .intersection(operationalDates)
            .removeAll(nonOperationalDates)
            .ranges()
            .flatMap { it.dates() }
            .toSet()
    }
}

fun Database.Read.getPreschoolOperationalDatesForChild(
    range: FiniteDateRange,
    childId: ChildId,
    terms: List<PreschoolTerm>,
): Set<LocalDate> =
    getPreschoolOperationalDatesForChildren(range, setOf(childId), terms)[childId] ?: emptySet()
