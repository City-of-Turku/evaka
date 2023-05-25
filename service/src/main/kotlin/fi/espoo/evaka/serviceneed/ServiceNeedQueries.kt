// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.serviceneed

import fi.espoo.evaka.daycare.service.ChildServiceNeedInfo
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.reservations.UnitAttendanceReservations
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.EvakaUserId
import fi.espoo.evaka.shared.GroupId
import fi.espoo.evaka.shared.PlacementId
import fi.espoo.evaka.shared.ServiceNeedId
import fi.espoo.evaka.shared.ServiceNeedOptionId
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.domain.NotFound
import java.time.LocalDate

fun Database.Read.getServiceNeedsByChild(childId: ChildId): List<ServiceNeed> {
    // language=SQL
    val sql =
        """
        SELECT 
            sn.id, sn.placement_id, sn.start_date, sn.end_date, sn.shift_care, sn.updated,
            sno.id as option_id, sno.name_fi as option_name_fi, sno.name_sv as option_name_sv, sno.name_en as option_name_en, sno.updated as option_updated,
            sn.confirmed_by as confirmed_user_id, u.name as confirmed_name, sn.confirmed_at
        FROM service_need sn
        JOIN service_need_option sno on sno.id = sn.option_id
        JOIN placement pl ON pl.id = sn.placement_id
        LEFT JOIN evaka_user u on u.id = sn.confirmed_by
        WHERE pl.child_id = :childId
        """
            .trimIndent()

    return createQuery(sql).bind("childId", childId).mapTo<ServiceNeed>().toList()
}

fun Database.Read.getServiceNeedsByUnit(
    unitId: DaycareId,
    startDate: LocalDate?,
    endDate: LocalDate?
): List<ServiceNeed> {
    // language=SQL
    val sql =
        """
        SELECT 
            sn.id, sn.placement_id, sn.start_date, sn.end_date, sn.shift_care, sn.updated,
            sno.id as option_id, sno.name_fi as option_name_fi, sno.name_sv as option_name_sv, sno.name_en as option_name_en, sno.updated AS option_updated,
            sn.confirmed_by as confirmed_user_id, u.name as confirmed_name, sn.confirmed_at
        FROM service_need sn
        JOIN service_need_option sno on sno.id = sn.option_id
        JOIN placement pl ON pl.id = sn.placement_id
        LEFT JOIN evaka_user u on u.id = sn.confirmed_by
        WHERE pl.unit_id = :unitId AND daterange(:start, :end, '[]') && daterange(sn.start_date, sn.end_date, '[]')
        """
            .trimIndent()

    return createQuery(sql)
        .bind("unitId", unitId)
        .bind("start", startDate)
        .bind("end", endDate)
        .mapTo<ServiceNeed>()
        .toList()
}

fun Database.Read.getServiceNeedSummary(childId: ChildId): List<ServiceNeedSummary> {
    val sql =
        """
SELECT
    sn.start_date,
    sn.end_date,
    sno.id AS option_id,
    sno.name_fi AS option_name_fi,
    sno.name_sv AS option_name_sv,
    sno.name_en AS option_name_en,
    sno.valid_placement_type AS option_valid_placement_type,
    u.name AS unit_name
FROM service_need sn
JOIN service_need_option sno ON sno.id = sn.option_id
JOIN placement p ON p.id = sn.placement_id
JOIN daycare u ON u.id = p.unit_id
WHERE p.child_id = :childId
"""
            .trimIndent()

    return createQuery(sql).bind("childId", childId).mapTo<ServiceNeedSummary>().toList()
}

fun Database.Read.getServiceNeed(id: ServiceNeedId): ServiceNeed {
    // language=sql
    val sql =
        """
        SELECT 
            sn.id, sn.placement_id, sn.start_date, sn.end_date, sn.shift_care, sn.updated,
            sno.id as option_id, sno.name_fi as option_name_fi, sno.name_sv as option_name_sv, sno.name_en as option_name_en, sno.updated AS option_updated,
            sn.confirmed_by as confirmed_user_id, u.name as confirmed_name, sn.confirmed_at
        FROM service_need sn
        JOIN service_need_option sno on sn.option_id = sno.id
        LEFT JOIN evaka_user u on u.id = sn.confirmed_by
        WHERE sn.id = :id
    """
            .trimIndent()

    return createQuery(sql).bind("id", id).mapTo<ServiceNeed>().firstOrNull()
        ?: throw NotFound("Service need $id not found")
}

fun Database.Read.getServiceNeedChildRange(id: ServiceNeedId): ServiceNeedChildRange {
    // language=sql
    val sql =
        """
        SELECT p.child_id, daterange(sn.start_date, sn.end_date, '[]')
        FROM service_need sn
        JOIN placement p on sn.placement_id = p.id
        WHERE sn.id = :id
    """
            .trimIndent()

    return createQuery(sql).bind("id", id).mapTo<ServiceNeedChildRange>().firstOrNull()
        ?: throw NotFound("Service need $id not found")
}

fun Database.Transaction.insertServiceNeed(
    placementId: PlacementId,
    startDate: LocalDate,
    endDate: LocalDate,
    optionId: ServiceNeedOptionId,
    shiftCare: Boolean,
    confirmedBy: EvakaUserId?,
    confirmedAt: HelsinkiDateTime?
): ServiceNeedId {
    // language=sql
    val sql =
        """
        INSERT INTO service_need (placement_id, start_date, end_date, option_id, shift_care, confirmed_by, confirmed_at) 
        VALUES (:placementId, :startDate, :endDate, :optionId, :shiftCare, :confirmedBy, :confirmedAt)
        RETURNING id;
    """
            .trimIndent()
    return createQuery(sql)
        .bind("placementId", placementId)
        .bind("startDate", startDate)
        .bind("endDate", endDate)
        .bind("optionId", optionId)
        .bind("shiftCare", shiftCare)
        .bind("confirmedBy", confirmedBy)
        .bind("confirmedAt", confirmedAt)
        .mapTo<ServiceNeedId>()
        .one()
}

fun Database.Transaction.updateServiceNeed(
    id: ServiceNeedId,
    startDate: LocalDate,
    endDate: LocalDate,
    optionId: ServiceNeedOptionId,
    shiftCare: Boolean,
    confirmedBy: EvakaUserId?,
    confirmedAt: HelsinkiDateTime?
) {
    // language=sql
    val sql =
        """
        UPDATE service_need
        SET start_date = :startDate, end_date = :endDate, option_id = :optionId, shift_care = :shiftCare, confirmed_by = :confirmedBy, confirmed_at = :confirmedAt
        WHERE id = :id
    """
            .trimIndent()

    createUpdate(sql)
        .bind("id", id)
        .bind("startDate", startDate)
        .bind("endDate", endDate)
        .bind("optionId", optionId)
        .bind("shiftCare", shiftCare)
        .bind("confirmedBy", confirmedBy)
        .bind("confirmedAt", confirmedAt)
        .execute()
}

fun Database.Transaction.deleteServiceNeed(id: ServiceNeedId) {
    createUpdate("DELETE FROM service_need WHERE id = :id").bind("id", id).execute()
}

fun Database.Read.getOverlappingServiceNeeds(
    placementId: PlacementId,
    startDate: LocalDate,
    endDate: LocalDate,
    excluding: ServiceNeedId?
): List<ServiceNeed> {
    // language=sql
    val sql =
        """
        SELECT 
            sn.id, sn.placement_id, sn.start_date, sn.end_date, sn.shift_care, sn.updated,
            sno.id as option_id, sno.name_fi as option_name_fi, sno.name_sv as option_name_sv, sno.name_en as option_name_en, sno.updated as option_updated,
            sn.confirmed_by as confirmed_user_id, u.name as confirmed_name, sn.confirmed_at
        FROM service_need sn
        JOIN service_need_option sno on sn.option_id = sno.id
        LEFT JOIN evaka_user u on u.id = sn.confirmed_by
        WHERE placement_id = :placementId AND daterange(sn.start_date, sn.end_date, '[]') && daterange(:startDate, :endDate, '[]')
    """
            .trimIndent()

    return createQuery(sql)
        .bind("placementId", placementId)
        .bind("startDate", startDate)
        .bind("endDate", endDate)
        .mapTo<ServiceNeed>()
        .list()
        .filter { it.id != excluding }
}

fun Database.Read.getServiceNeedOptions(): List<ServiceNeedOption> {
    return createQuery(
            """
SELECT
    id,
    name_fi,
    name_sv,
    name_en,
    valid_placement_type,
    default_option,
    fee_coefficient,
    occupancy_coefficient,
    occupancy_coefficient_under_3y,
    realized_occupancy_coefficient,
    realized_occupancy_coefficient_under_3y,
    daycare_hours_per_week,
    contract_days_per_month,
    part_day,
    part_week,
    fee_description_fi,
    fee_description_sv,
    voucher_value_description_fi,
    voucher_value_description_sv,
    active,
    updated
FROM service_need_option
ORDER BY display_order, part_week, daycare_hours_per_week DESC, part_day, name_fi
        """
                .trimIndent()
        )
        .mapTo<ServiceNeedOption>()
        .list()
}

fun Database.Read.findServiceNeedOptionById(id: ServiceNeedOptionId): ServiceNeedOption? {
    return createQuery(
            """
SELECT
    id,
    name_fi,
    name_sv,
    name_en,
    valid_placement_type,
    default_option,
    fee_coefficient,
    occupancy_coefficient,
    occupancy_coefficient_under_3y,
    realized_occupancy_coefficient,
    realized_occupancy_coefficient_under_3y,
    daycare_hours_per_week,
    part_day,
    part_week,
    fee_description_fi,
    fee_description_sv,
    voucher_value_description_fi,
    voucher_value_description_sv,
    active,
    updated
FROM service_need_option
WHERE id = :id
        """
                .trimIndent()
        )
        .bind("id", id)
        .mapTo<ServiceNeedOption>()
        .firstOrNull()
}

fun Database.Read.getServiceNeedOptionPublicInfos(
    placementTypes: List<PlacementType>
): List<ServiceNeedOptionPublicInfo> {
    val sql =
        """
        SELECT
            id,
            name_fi, name_sv, name_en,
            valid_placement_type
        FROM service_need_option
        WHERE default_option IS FALSE AND show_for_citizen IS TRUE AND valid_placement_type = ANY(:placementTypes::placement_type[])
        ORDER BY display_order
    """
            .trimIndent()
    return createQuery(sql)
        .bind("placementTypes", placementTypes)
        .mapTo<ServiceNeedOptionPublicInfo>()
        .list()
}

fun Database.Read.getGroupedActualServiceNeedInfosByRangeAndUnit(
    unitId: DaycareId,
    range: FiniteDateRange
): UnitAttendanceReservations.UnitServiceNeedInfo {
    data class QueryResult(
        val childId: ChildId,
        val hasContractDays: Boolean,
        val optionName: String,
        val validDuring: FiniteDateRange,
        val groupId: GroupId?
    )
    val sql =
        """
SELECT p.child_id,
       sno.contract_days_per_month IS NOT NULL     AS has_contract_days,
       sno.name_fi                                 AS option_name,
       daterange(sn.start_date, sn.end_date, '[]') AS valid_during,
       gp.daycare_group_id                         AS group_id
FROM placement p
         JOIN service_need sn ON sn.placement_id = p.id
         JOIN service_need_option sno ON sn.option_id = sno.id
         LEFT JOIN daycare_group_placement gp ON p.id = gp.daycare_placement_id AND
                                                 daterange(p.start_date, p.end_date, '[]') &&
                                                 daterange(gp.start_date, gp.end_date, '[]')
WHERE daterange(sn.start_date, sn.end_date, '[]') *
      daterange(COALESCE(gp.start_date, p.start_date), COALESCE(gp.end_date, p.end_date), '[]') && :range
  AND p.unit_id = :unitId

UNION ALL

SELECT bc.child_id,
       sno.contract_days_per_month IS NOT NULL     AS has_contract_days,
       sno.name_fi                                 AS option_name,
       daterange(sn.start_date, sn.end_date, '[]') AS valid_during,
       bc.group_id                                 AS group_id
FROM backup_care bc
         JOIN placement p ON bc.child_id = p.child_id AND
                             daterange(bc.start_date, bc.end_date, '[]') && daterange(p.start_date, p.end_date, '[]')
         JOIN service_need sn ON sn.placement_id = p.id
         JOIN service_need_option sno ON sn.option_id = sno.id
WHERE daterange(p.start_date, p.end_date, '[]') * daterange(bc.start_date, bc.end_date, '[]') && :range
  AND daterange(bc.start_date, bc.end_date, '[]') * daterange(sn.start_date, sn.end_date, '[]') && :range
  AND bc.unit_id = :unitId
  ORDER BY group_id, valid_during
        """

    val groupMap =
        createQuery(sql)
            .bind("unitId", unitId)
            .bind("range", range)
            .mapTo<QueryResult>()
            .toList()
            .groupBy { it.groupId }
            .map { (groupId, results) ->
                groupId to
                    results.map {
                        ChildServiceNeedInfo(
                            childId = it.childId,
                            hasContractDays = it.hasContractDays,
                            optionName = it.optionName,
                            validDuring = it.validDuring
                        )
                    }
            }
            .toMap()

    return UnitAttendanceReservations.UnitServiceNeedInfo(
        unitId = unitId,
        groups =
            groupMap.entries.mapNotNull { (groupId, childInfos) ->
                if (groupId == null) {
                    null
                } else {
                    UnitAttendanceReservations.GroupServiceNeedInfo(
                        groupId = groupId,
                        childInfos = childInfos
                    )
                }
            },
        ungrouped = groupMap[null] ?: emptyList()
    )
}

fun Database.Read.getActualServiceNeedInfosByRangeAndGroup(
    groupId: GroupId,
    range: FiniteDateRange
): List<ChildServiceNeedInfo> {
    val sql =
        """
SELECT p.child_id,
       sno.contract_days_per_month IS NOT NULL     AS has_contract_days,
       sno.name_fi                                 AS option_name,
       daterange(sn.start_date, sn.end_date, '[]') AS valid_during
FROM daycare_group_placement AS gp
         JOIN placement p ON gp.daycare_placement_id = p.id
    AND daterange(p.start_date, p.end_date, '[]') && daterange(gp.start_date, gp.end_date, '[]')
         JOIN service_need sn ON sn.placement_id = p.id
         JOIN service_need_option sno ON sn.option_id = sno.id
WHERE daterange(p.start_date, p.end_date, '[]') * daterange(gp.start_date, gp.end_date, '[]') && :range
  AND daterange(sn.start_date, sn.end_date, '[]') * daterange(gp.start_date, gp.end_date, '[]') && :range
  AND gp.daycare_group_id = :groupId

UNION ALL

SELECT bc.child_id,
       sno.contract_days_per_month IS NOT NULL     AS has_contract_days,
       sno.name_fi                                 AS option_name,
       daterange(sn.start_date, sn.end_date, '[]') AS valid_during
FROM backup_care bc
         JOIN placement p ON bc.child_id = p.child_id
    AND daterange(bc.start_date, bc.end_date, '[]') && daterange(p.start_date, p.end_date, '[]')
         JOIN service_need sn ON sn.placement_id = p.id
         JOIN service_need_option sno ON sn.option_id = sno.id
WHERE daterange(p.start_date, p.end_date, '[]') * daterange(bc.start_date, bc.end_date, '[]') && :range
  AND daterange(bc.start_date, bc.end_date, '[]') * daterange(sn.start_date, sn.end_date, '[]') && :range
  AND group_id = :groupId
ORDER BY child_id, valid_during
        """

    return createQuery(sql)
        .bind("groupId", groupId)
        .bind("range", range)
        .mapTo<ChildServiceNeedInfo>()
        .toList()
}
