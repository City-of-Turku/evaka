// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.reports

import fi.espoo.evaka.Audit
import fi.espoo.evaka.daycare.domain.ProviderType
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.db.Predicate
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.getHolidays
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import java.time.LocalDate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class SextetReportController(private val accessControl: AccessControl) {
    @GetMapping("/employee/reports/sextet")
    fun getSextetReport(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestParam year: Int,
        @RequestParam placementType: PlacementType,
        @RequestParam(required = false) unitProviderTypes: Set<ProviderType>?,
    ): List<SextetReportRow> {
        return db.connect { dbc ->
                dbc.read {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.Global.READ_SEXTET_REPORT,
                    )

                    it.setStatementTimeout(REPORT_STATEMENT_TIMEOUT)
                    it.sextetReport(
                        LocalDate.of(year, 1, 1),
                        LocalDate.of(year, 12, 31),
                        placementType,
                        unitProviderTypes,
                    )
                }
            }
            .also {
                Audit.SextetReportRead.log(
                    meta =
                        mapOf("year" to year, "placementType" to placementType, "count" to it.size)
                )
            }
    }
}

fun Database.Read.sextetReport(
    from: LocalDate,
    to: LocalDate,
    placementType: PlacementType,
    unitProviderTypes: Set<ProviderType>?,
): List<SextetReportRow> {
    val holidays = getHolidays(FiniteDateRange(from, to))

    val absencePredicate =
        if (placementType.absenceCategories().size == 1) {
            Predicate {
                where(
                    "NOT EXISTS (SELECT FROM absence WHERE child_id = $it.child_id AND date = $it.date)"
                )
            }
        } else {
            Predicate {
                where(
                    """
            NOT EXISTS (SELECT FROM absence WHERE child_id = $it.child_id AND date = $it.date AND category = 'BILLABLE') OR 
            NOT EXISTS (SELECT FROM absence WHERE child_id = $it.child_id AND date = $it.date AND category = 'NONBILLABLE')
        """
                )
            }
        }

    val unitPredicates =
        Predicate.allNotNull(
            unitProviderTypes?.let {
                Predicate { table -> where("$table.provider_type = ANY (${bind(it)})") }
            }
        )

    return createQuery {
            sql(
                """
WITH operational_days AS (
    SELECT daycare.id AS unit_id, date
    FROM generate_series(${bind(from)}, ${bind(to)}, '1 day'::interval) date
    JOIN daycare ON extract(isodow from date) = ANY(coalesce(daycare.shift_care_operation_days, daycare.operation_days))
), effective_placements AS (
    SELECT
        od.date AS date,
        b.unit_id,
        b.child_id,
        p.type AS placement_type,
        sn.shift_care = ANY('{FULL,INTERMITTENT}') AS has_shift_care
    FROM operational_days od
    JOIN backup_care b ON b.unit_id = od.unit_id AND od.date BETWEEN b.start_date AND b.end_date
    JOIN placement p ON p.child_id = b.child_id AND od.date BETWEEN p.start_date AND p.end_date
    LEFT JOIN service_need sn ON sn.placement_id = p.id AND od.date BETWEEN sn.start_date AND sn.end_date

    UNION ALL

    SELECT
        od.date AS date,
        p.unit_id,
        p.child_id,
        p.type AS placement_type,
        sn.shift_care = ANY('{FULL,INTERMITTENT}') AS has_shift_care
    FROM operational_days od
    JOIN placement p ON p.unit_id = od.unit_id AND od.date BETWEEN p.start_date AND p.end_date
    LEFT JOIN service_need sn ON sn.placement_id = p.id AND od.date BETWEEN sn.start_date AND sn.end_date
    WHERE NOT EXISTS (
        SELECT 1
        FROM backup_care b
        WHERE b.child_id = p.child_id AND od.date BETWEEN b.start_date AND b.end_date
    )
)
SELECT
    ep.unit_id,
    d.name AS unit_name,
    ${bind(placementType)} AS placement_type,
    count(ep.date) AS attendance_days
FROM effective_placements ep
JOIN daycare d ON d.id = ep.unit_id
WHERE ${predicate(absencePredicate.forTable("ep"))} AND (
    ep.has_shift_care OR extract(isodow FROM ep.date) = ANY(d.operation_days)
) AND (
    (ep.has_shift_care AND d.shift_care_open_on_holidays) OR ep.date != ALL (${bind(holidays)})
)
AND ep.placement_type = ${bind(placementType)}
AND ${predicate(unitPredicates.forTable("d"))}
GROUP BY ep.unit_id, d.name
ORDER BY d.name
    """
            )
        }
        .toList<SextetReportRow>()
}

data class SextetReportRow(
    val unitId: DaycareId,
    val unitName: String,
    val placementType: PlacementType,
    val attendanceDays: Int,
)
