// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.varda.new

import com.fasterxml.jackson.databind.json.JsonMapper
import com.fasterxml.jackson.module.kotlin.readValue
import fi.espoo.evaka.daycare.domain.ProviderType
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.ServiceNeedId
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.DateRange
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import java.time.LocalDate

private val vardaPlacementTypes =
    listOf(
        PlacementType.DAYCARE,
        PlacementType.DAYCARE_PART_TIME,
        PlacementType.DAYCARE_FIVE_YEAR_OLDS,
        PlacementType.DAYCARE_PART_TIME_FIVE_YEAR_OLDS,
        PlacementType.PRESCHOOL_DAYCARE,
        PlacementType.PREPARATORY_DAYCARE
    )
private val vardaTemporaryPlacementTypes =
    listOf(PlacementType.TEMPORARY_DAYCARE, PlacementType.TEMPORARY_DAYCARE_PART_DAY)

data class VardaServiceNeed(
    val id: ServiceNeedId,
    val serviceNeedUpdated: HelsinkiDateTime,
    val childId: ChildId,
    val applicationDate: LocalDate?,
    val range: FiniteDateRange,
    val hoursPerWeek: Double,
    val temporary: Boolean,
    val daily: Boolean,
    val shiftCare: Boolean,
    val providerType: ProviderType,
    val ophOrganizerOid: String,
    val ophUnitOid: String
)

fun Database.Read.getVardaServiceNeeds(childId: ChildId, range: DateRange): List<VardaServiceNeed> {
    return createQuery {
            sql(
                """
SELECT
    sn.id,
    sn.updated AS service_need_updated,
    p.child_id AS child_id,
    daterange(sn.start_date, sn.end_date, '[]') * ${bind(range)} AS range,
    application_match.sentdate AS application_date,
    sno.daycare_hours_per_week AS hours_per_week,
    CASE 
        WHEN sno.valid_placement_type = ANY(${bind(vardaTemporaryPlacementTypes)}::placement_type[]) THEN true
        ELSE false
    END AS temporary,
    NOT sn.part_week AS daily,
    sn.shift_care = 'FULL' as shift_care,
    u.provider_type,
    u.oph_organizer_oid,
    u.oph_unit_oid
FROM service_need sn
JOIN service_need_option sno on sn.option_id = sno.id
JOIN placement p ON p.id = sn.placement_id
JOIN daycare u ON u.id = p.unit_id
LEFT JOIN LATERAL (
    -- Find the newest application, with sent date before the service need's start date, whose decision points to
    -- the same unit and overlaps with the service need's date range.
    --
    -- This is an approximation, because there's really no mapping from service needs to applications, but even still
    -- Varda requires us to provide an application date.
    --
    -- It's possible that no application is found, in which case application_date is null.
    SELECT a.sentdate
    FROM application a
    JOIN decision d ON d.application_id = a.id
    WHERE
        a.child_id = p.child_id AND a.status = 'ACTIVE' AND a.sentdate < sn.start_date AND
        d.unit_id = p.unit_id AND d.status = 'ACCEPTED' AND
        daterange(d.start_date, d.end_date, '[]') && daterange(sn.start_date, sn.end_date, '[]')
    ORDER BY a.sentdate DESC
    LIMIT 1
) application_match ON true
WHERE
    p.child_id = ${bind(childId)} AND
    daterange(sn.start_date, sn.end_date, '[]') && ${bind(range)} AND
    p.type = ANY(${bind(vardaPlacementTypes)}::placement_type[]) AND
    sno.daycare_hours_per_week >= 1 AND
    u.upload_children_to_varda AND
    u.oph_organizer_oid IS NOT NULL AND
    u.oph_unit_oid IS NOT NULL
ORDER BY sn.start_date
"""
            )
        }
        .toList<VardaServiceNeed>()
}

data class VardaFeeData(
    val validDuring: DateRange,
    val headOfFamilyId: PersonId,
    val partnerId: PersonId?,
    val placementType: PlacementType?,
    val familySize: Int,
    val childFee: Int,
    val ophOrganizerOid: String,
    val voucherValue: Int?
)

fun Database.Read.getVardaFeeData(childId: ChildId, range: FiniteDateRange): List<VardaFeeData> =
    createQuery {
            sql(
                """
SELECT
    fd.valid_during * ${bind(range)} AS valid_during,
    fd.head_of_family_id,
    fd.partner_id,
    fdc.placement_type,
    fd.family_size,
    fdc.final_fee AS child_fee,
    u.oph_organizer_oid,
    NULL AS voucher_value
FROM fee_decision fd
JOIN fee_decision_child fdc ON fdc.fee_decision_id = fd.id
JOIN daycare u ON u.id = fdc.placement_unit_id
WHERE
    fd.status = 'SENT' AND
    fd.valid_during && ${bind(range)} AND
    fdc.child_id = ${bind(childId)} AND
    u.oph_organizer_oid IS NOT NULL

UNION ALL

SELECT
    daterange(vvd.valid_from, vvd.valid_to, '[]') * ${bind(range)} AS valid_during,
    vvd.head_of_family_id,
    vvd.partner_id,
    vvd.placement_type,
    vvd.family_size,
    vvd.final_co_payment AS child_fee,
    u.oph_organizer_oid,
    vvd.voucher_value
FROM voucher_value_decision vvd
JOIN daycare u ON u.id = vvd.placement_unit_id
WHERE
    vvd.status = 'SENT' AND
    daterange(vvd.valid_from, vvd.valid_to, '[]') && ${bind(range)} AND
    vvd.child_id = ${bind(childId)} AND
    vvd.placement_type IS NOT NULL AND
    u.oph_organizer_oid IS NOT NULL

ORDER BY valid_during
"""
            )
        }
        .toList()

data class VardaPerson(
    val firstName: String,
    val lastName: String,
    val socialSecurityNumber: String?,
    val ophPersonOid: String?,
)

fun Database.Read.getVardaPerson(childId: ChildId): VardaPerson =
    createQuery {
            sql(
                """
                SELECT first_name, last_name, social_security_number, oph_person_oid
                FROM person
                WHERE id = ${bind(childId)}
                """
            )
        }
        .exactlyOne()

fun Database.Transaction.addNewChildrenForVardaUpdate(migrationSpeed: Int = 0) {
    if (migrationSpeed > 0) {
        // Move children from varda_reset_child (old integration) to varda_state (new integration)
        execute {
            sql(
                """
                WITH inserted_children AS (
                    INSERT INTO varda_state (child_id, state)
                    SELECT evaka_child_id, null
                    FROM varda_reset_child
                    WHERE NOT EXISTS (SELECT FROM varda_state WHERE child_id = evaka_child_id)
                    LIMIT ${bind(migrationSpeed)}
                    RETURNING child_id
                )
                DELETE FROM varda_reset_child
                WHERE evaka_child_id IN (SELECT child_id FROM inserted_children)
                """
            )
        }
    }

    // Insert newly placed children to varda_state
    createUpdate {
            sql(
                """
                    INSERT INTO varda_state (child_id, state)
                    SELECT child_id, null
                    FROM placement pl
                    WHERE
                        pl.type = ANY(${bind(vardaPlacementTypes)}) AND
                        NOT EXISTS (SELECT FROM varda_state vs WHERE vs.child_id = pl.child_id) AND
                        NOT EXISTS (SELECT FROM varda_reset_child vrc WHERE vrc.evaka_child_id = pl.child_id)
                    ON CONFLICT (child_id) DO NOTHING
                    """
            )
        }
        .execute()
}

fun Database.Read.getVardaUpdateChildIds(): List<ChildId> =
    createQuery { sql("SELECT child_id FROM varda_state") }.toList()

/**
 * In addition to returning `null` if `state` is `NULL`, also returns `null` if the state cannot be
 * deserialized as `T`. This can happen if the Kotlin data structures that represent the state have
 * been changed. Because there's no "previous state" to compare against, the Varda update should be
 * performed in this case.
 */
inline fun <reified T> Database.Read.getVardaUpdateState(
    jsonMapper: JsonMapper,
    childId: ChildId
): T? =
    createQuery { sql("SELECT state::text FROM varda_state WHERE child_id = ${bind(childId)}") }
        .exactlyOne<String?>()
        ?.let {
            try {
                jsonMapper.readValue<T>(it)
            } catch (e: Exception) {
                null
            }
        }

fun Database.Transaction.setVardaUpdateState(childId: ChildId, state: Any?) {
    createUpdate {
            sql(
                """
                UPDATE varda_state SET state = ${bindJson(state)}
                WHERE child_id = ${bind(childId)}
                """
            )
        }
        .execute()
}
