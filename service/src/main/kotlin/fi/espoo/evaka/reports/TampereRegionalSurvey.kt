// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.reports

import fi.espoo.evaka.Audit
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.db.Predicate
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.getHolidays
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import java.time.LocalDate
import java.time.YearMonth
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class TampereRegionalSurvey(private val accessControl: AccessControl) {
    @GetMapping("/employee/reports/tampere-regional-survey/monthly-statistics")
    fun getTampereRegionalSurveyMonthlyStatistics(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestParam year: Int,
    ): RegionalSurveyReportResult {
        val range = FiniteDateRange(LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31))
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Global.READ_TAMPERE_REGIONAL_SURVEY_REPORT,
                    )

                    val reportingDays =
                        generateSequence(YearMonth.of(year, 1)) { it.plusMonths(1) }
                            .take(12)
                            .map { month -> month.atEndOfMonth() }
                            .toList()

                    val municipalDaycareResults =
                        tx.getMonthlyMunicipalPlacementsByAgeAndPartTime(range, reportingDays)
                            .associateBy { it.month }
                    val familyDaycareResults =
                        tx.getMonthlyFamilyDaycareCounts(reportingDays, range).associateBy {
                            it.month
                        }
                    val municipalShiftCareResults =
                        tx.getMonthlyShiftCareCounts(range, reportingDays).associateBy { it.month }
                    val assistanceResults =
                        tx.getMunicipalAssistanceMonthlyResults(reportingDays).associateBy {
                            it.month
                        }

                    val monthlyResults =
                        (1..12).map {
                            val familyDaycareRows =
                                familyDaycareResults[it] ?: MonthlyFamilyDaycareResult(month = it)
                            val municipalDaycareRows =
                                municipalDaycareResults[it]
                                    ?: MonthlyMunicipalDaycareResult(month = it)
                            val municipalShiftCareRows =
                                municipalShiftCareResults[it]
                                    ?: MonthlyMunicipalShiftCareResult(month = it)
                            val assistanceRows =
                                assistanceResults[it] ?: MonthlyAssistanceResult(month = it)
                            RegionalSurveyReportMonthlyStatistics(
                                month = it,
                                familyOver3Count = familyDaycareRows.familyOver3Count,
                                familyUnder3Count = familyDaycareRows.familyUnder3Count,
                                municipalOver3FullTimeCount =
                                    municipalDaycareRows.municipalOver3FullTimeCount,
                                municipalUnder3FullTimeCount =
                                    municipalDaycareRows.municipalUnder3FullTimeCount,
                                municipalOver3PartTimeCount =
                                    municipalDaycareRows.municipalOver3PartTimeCount,
                                municipalUnder3PartTimeCount =
                                    municipalDaycareRows.municipalUnder3PartTimeCount,
                                assistanceCount = assistanceRows.assistanceCount,
                                municipalShiftCareCount =
                                    municipalShiftCareRows.municipalShiftCareCount,
                            )
                        }

                    RegionalSurveyReportResult(year = year, monthlyCounts = monthlyResults)
                }
            }
            .also { Audit.TampereRegionalSurveyMonthly.log(meta = mapOf("year" to year)) }
    }

    @GetMapping("/employee/reports/tampere-regional-survey/age-statistics")
    fun getTampereRegionalSurveyAgeStatistics(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @RequestParam year: Int,
    ): RegionalSurveyReportAgeStatisticsResult {
        val yearlyStatDay = LocalDate.of(year, 12, 31)
        val languageStatDay = LocalDate.of(year, 11, 30)
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Global.READ_TAMPERE_REGIONAL_SURVEY_REPORT,
                    )

                    val voucherCounts =
                        tx.getAgeDivisionCounts(
                            statDay = yearlyStatDay,
                            daycarePred =
                                Predicate {
                                    where(
                                        "$it.provider_type = ANY ('{PRIVATE_SERVICE_VOUCHER}') AND $it.type && '{CENTRE}'"
                                    )
                                },
                        )

                    val purchasedCounts =
                        tx.getAgeDivisionCounts(
                            statDay = yearlyStatDay,
                            daycarePred =
                                Predicate {
                                    where(
                                        "$it.provider_type = ANY ('{PURCHASED,EXTERNAL_PURCHASED}') AND $it.type && '{CENTRE}'"
                                    )
                                },
                        )

                    val clubCounts =
                        tx.getAgeDivisionCounts(
                            statDay = yearlyStatDay,
                            placementPred = Predicate { where("$it.type = 'CLUB'") },
                        )

                    val nonNativeLanguageCount =
                        tx.getAgeDivisionCounts(
                            statDay = languageStatDay,
                            personPred =
                                Predicate {
                                    where(
                                        """
                                $it.language IS NOT NULL
                                    AND $it.duplicate_of IS NULL
                                    AND NOT ($it.language ilike ANY ('{FI,SV,RI,SE,VK}'))
                                    """
                                    )
                                },
                        )

                    val yearlyRange =
                        FiniteDateRange(LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31))

                    val familyCareDayCounts =
                        tx.getEffectiveCareDayCounts(
                            range = yearlyRange,
                            daycarePred =
                                Predicate {
                                    where(
                                        """
                               $it.provider_type = ANY ('{MUNICIPAL}')
                                 AND $it.type && '{FAMILY}'
                            """
                                    )
                                },
                        )

                    val daycareDayCounts =
                        tx.getEffectiveCareDayCounts(
                            range = yearlyRange,
                            daycarePred =
                                Predicate {
                                    where(
                                        """
                               $it.provider_type = ANY ('{MUNICIPAL}')
                                 AND $it.type && '{CENTRE}'
                            """
                                    )
                                },
                        )

                    RegionalSurveyReportAgeStatisticsResult(
                        year = year,
                        ageStatistics =
                            listOf(
                                AgeStatisticsResult(
                                    voucherUnder3Count = voucherCounts.under3Count,
                                    voucherOver3Count = voucherCounts.over3Count,
                                    purchasedUnder3Count = purchasedCounts.under3Count,
                                    purchasedOver3Count = purchasedCounts.over3Count,
                                    clubUnder3Count = clubCounts.under3Count,
                                    clubOver3Count = clubCounts.over3Count,
                                    nonNativeLanguageUnder3Count =
                                        nonNativeLanguageCount.under3Count,
                                    nonNativeLanguageOver3Count = nonNativeLanguageCount.over3Count,
                                    effectiveCareDaysUnder3Count = daycareDayCounts.under3Count,
                                    effectiveCareDaysOver3Count = daycareDayCounts.over3Count,
                                    effectiveFamilyDaycareDaysUnder3Count =
                                        familyCareDayCounts.under3Count,
                                    effectiveFamilyDaycareDaysOver3Count =
                                        familyCareDayCounts.over3Count,
                                )
                            ),
                    )
                }
            }
            .also { Audit.TampereRegionalSurveyAgeStatistics.log(meta = mapOf("year" to year)) }
    }

    private fun Database.Read.getMunicipalAssistanceMonthlyResults(
        reportingDays: List<LocalDate>
    ): List<MonthlyAssistanceResult> {
        val data =
            getMonthlyAssistanceCountRows(reportingDays = reportingDays).associateBy { it.month }

        return (1..12).map { month -> data[month] ?: MonthlyAssistanceResult(month = month) }
    }

    data class MonthlyMunicipalDaycareResult(
        val month: Int,
        val municipalOver3PartTimeCount: Int = 0,
        val municipalUnder3PartTimeCount: Int = 0,
        val municipalOver3FullTimeCount: Int = 0,
        val municipalUnder3FullTimeCount: Int = 0,
    )

    data class MonthlyAssistanceResult(val month: Int, val assistanceCount: Int = 0)

    data class MonthlyMunicipalShiftCareResult(
        val month: Int,
        val municipalShiftCareCount: Int = 0,
    )

    data class MonthlyFamilyDaycareResult(
        val month: Int = 0,
        val familyOver3Count: Int = 0,
        val familyUnder3Count: Int = 0,
    )

    data class RegionalSurveyReportResult(
        val year: Int,
        val monthlyCounts: List<RegionalSurveyReportMonthlyStatistics>,
    )

    data class RegionalSurveyReportMonthlyStatistics(
        val month: Int,
        val familyOver3Count: Int,
        val familyUnder3Count: Int,
        val municipalOver3PartTimeCount: Int,
        val municipalUnder3PartTimeCount: Int,
        val municipalOver3FullTimeCount: Int,
        val municipalUnder3FullTimeCount: Int,
        val municipalShiftCareCount: Int,
        val assistanceCount: Int,
    )

    data class AgeStatisticsResult(
        val voucherUnder3Count: Int,
        val voucherOver3Count: Int,
        val purchasedUnder3Count: Int,
        val purchasedOver3Count: Int,
        val clubUnder3Count: Int,
        val clubOver3Count: Int,
        val nonNativeLanguageUnder3Count: Int,
        val nonNativeLanguageOver3Count: Int,
        val effectiveCareDaysUnder3Count: Int,
        val effectiveCareDaysOver3Count: Int,
        val effectiveFamilyDaycareDaysUnder3Count: Int,
        val effectiveFamilyDaycareDaysOver3Count: Int,
    )

    data class RegionalSurveyReportAgeStatisticsResult(
        val year: Int,
        val ageStatistics: List<AgeStatisticsResult>,
    )

    data class AgeDivisionCount(val under3Count: Int, val over3Count: Int)

    private fun Database.Read.getMonthlyMunicipalPlacementsByAgeAndPartTime(
        range: FiniteDateRange,
        statDays: List<LocalDate>,
    ): List<MonthlyMunicipalDaycareResult> {
        return createQuery {
                sql(
                    """
WITH child_rows AS (SELECT pl.child_id,
                           p.date_of_birth,
                           CASE
                               WHEN (sn.start_date IS NOT NULL) THEN sno.daycare_hours_per_month
                               ELSE default_sno.daycare_hours_per_month END                          as monthly_hours,
                           CASE
                               WHEN (sn.start_date IS NOT NULL) THEN sno.contract_days_per_month
                               ELSE default_sno.contract_days_per_month END                          as monthly_days,
                           CASE
                               WHEN (sn.start_date IS NOT NULL)
                                   THEN daterange(sn.start_date, sn.end_date, '[]') * ${bind(range)}
                               ELSE daterange(pl.start_date, pl.end_date, '[]') * ${bind(range)} END as validity
                    FROM placement pl
                             JOIN person p ON pl.child_id = p.id
                             JOIN daycare d ON pl.unit_id = d.id
                             LEFT JOIN service_need sn
                                       ON pl.id = sn.placement_id
                                           AND daterange(sn.start_date, sn.end_date, '[]') && ${bind(range)}
                             LEFT JOIN service_need_option sno ON sn.option_id = sno.id
                             LEFT JOIN service_need_option default_sno
                                       ON pl.type = default_sno.valid_placement_type AND default_sno.default_option
                    WHERE pl.type = ANY ('{DAYCARE,PRESCHOOL_DAYCARE,PRESCHOOL_DAYCARE_ONLY}')
                      AND d.provider_type = ANY ('{MUNICIPAL}')
                      AND daterange(pl.start_date, pl.end_date, '[]') && ${bind(range)})
SELECT extract(MONTH FROM day)                                            AS month,
       count(DISTINCT row.child_id)
       FILTER ( WHERE date_part('year', age(day, row.date_of_birth)) < 3
           AND (row.monthly_hours < 86 OR row.monthly_days < 11))         AS municipal_under_3_part_time_count,
       count(DISTINCT row.child_id)
       FILTER ( WHERE date_part('year', age(day, row.date_of_birth)) < 3
           AND ((row.monthly_hours IS NULL OR row.monthly_hours >= 86)
               AND (row.monthly_days IS NULL OR row.monthly_days >= 11))) AS municipal_under_3_full_time_count,
       count(DISTINCT row.child_id)
       FILTER ( WHERE date_part('year', age(day, row.date_of_birth)) >= 3
           AND (row.monthly_hours < 86 OR row.monthly_days < 11))         AS municipal_over_3_part_time_count,
       count(DISTINCT row.child_id)
       FILTER ( WHERE date_part('year', age(day, row.date_of_birth)) >= 3
           AND ((row.monthly_hours IS NULL OR row.monthly_hours >= 86)
               AND (row.monthly_days IS NULL OR row.monthly_days >= 11))) AS municipal_over_3_full_time_count
FROM unnest(${bind(statDays)}::date[]) day
         LEFT JOIN child_rows row on validity @> day
GROUP BY month 
                """
                )
            }
            .toList<MonthlyMunicipalDaycareResult>()
    }

    private fun Database.Read.getMonthlyShiftCareCounts(
        range: FiniteDateRange,
        statDays: List<LocalDate>,
    ): List<MonthlyMunicipalShiftCareResult> {
        return createQuery {
                sql(
                    """
WITH child_rows AS (SELECT pl.child_id,
                           daterange(sn.start_date, sn.end_date, '[]') * ${bind(range)} AS validity
                    FROM placement pl
                             JOIN daycare d ON pl.unit_id = d.id
                             JOIN service_need sn
                                  ON pl.id = sn.placement_id
                                      AND daterange(sn.start_date, sn.end_date, '[]') && ${bind(range)}
                    WHERE pl.type = ANY ('{DAYCARE,PRESCHOOL_DAYCARE,PRESCHOOL_DAYCARE_ONLY}')
                      AND d.provider_type = ANY ('{MUNICIPAL}')
                      AND sn.shift_care = ANY ('{FULL,INTERMITTENT}')
                      AND daterange(pl.start_date, pl.end_date, '[]') && ${bind(range)})
SELECT extract(MONTH FROM day)      AS month,
       count(DISTINCT row.child_id) AS municipal_shift_care_count
FROM unnest(${bind(statDays)}::date[]) day
         LEFT JOIN child_rows row on validity @> day
GROUP BY month
                """
                )
            }
            .toList<MonthlyMunicipalShiftCareResult>()
    }

    private fun Database.Read.getMonthlyAssistanceCountRows(
        reportingDays: List<LocalDate>
    ): List<MonthlyAssistanceResult> {
        return createQuery {
                sql(
                    """
SELECT extract(MONTH FROM day)     as month,
       count(distinct pl.child_id) as assistance_count
FROM unnest(${bind(reportingDays)}::date[]) day
         JOIN placement pl
              ON daterange(pl.start_date, pl.end_date, '[]') @> day
         JOIN daycare d ON pl.unit_id = d.id
WHERE pl.type = ANY ('{DAYCARE,PRESCHOOL_DAYCARE,PRESCHOOL_DAYCARE_ONLY}')
  AND (EXISTS (SELECT FROM assistance_factor af WHERE af.child_id = pl.child_id AND af.valid_during @> day)
    OR EXISTS (SELECT
               FROM assistance_action an
                        JOIN assistance_action_option_ref anor ON anor.action_id = an.id
                        JOIN assistance_action_option aao ON anor.option_id = aao.id
               WHERE aao.value = ANY ('{10,40}')
                 AND an.child_id = pl.child_id))
GROUP BY day
                """
                )
            }
            .toList<MonthlyAssistanceResult>()
    }

    private fun Database.Read.getMonthlyFamilyDaycareCounts(
        statDays: List<LocalDate>,
        range: FiniteDateRange,
    ): List<MonthlyFamilyDaycareResult> {
        return createQuery {
                sql(
                    """
WITH child_rows AS (SELECT pl.child_id,
                           p.date_of_birth,
                           daterange(pl.start_date, pl.end_date, '[]') * ${bind(range)} AS validity
                    FROM placement pl
                             JOIN person p ON p.id = pl.child_id
                             JOIN daycare d ON pl.unit_id = d.id
                    WHERE pl.type = ANY ('{DAYCARE,PRESCHOOL_DAYCARE,PRESCHOOL_DAYCARE_ONLY}')
                      AND d.type && '{FAMILY,GROUP_FAMILY}'::care_types[]
                      AND daterange(pl.start_date, pl.end_date, '[]') && ${bind(range)})
SELECT extract(MONTH FROM day)                                             AS month,
       count(DISTINCT row.child_id)
       FILTER ( WHERE date_part('year', age(day, row.date_of_birth)) < 3)  AS family_under_3_count,
       count(DISTINCT row.child_id)
       FILTER ( WHERE date_part('year', age(day, row.date_of_birth)) >= 3) AS family_over_3_count
FROM unnest(${bind(statDays)}::date[]) day
         LEFT JOIN child_rows row on validity @> day
GROUP BY month
                """
                )
            }
            .toList<MonthlyFamilyDaycareResult>()
    }

    private fun Database.Read.getAgeDivisionCounts(
        daycarePred: Predicate = Predicate.alwaysTrue(),
        placementPred: Predicate = Predicate.alwaysTrue(),
        personPred: Predicate = Predicate.alwaysTrue(),
        statDay: LocalDate,
    ): AgeDivisionCount {
        return createQuery {
                sql(
                    """
WITH child_rows AS (SELECT pl.child_id,
                           date_part('year', age(${bind(statDay)}, p.date_of_birth)) as age
                    FROM placement pl
                             JOIN person p ON p.id = pl.child_id
                             JOIN daycare d ON pl.unit_id = d.id
                    WHERE ${predicate(placementPred.forTable("pl"))}
                      AND ${predicate(daycarePred.forTable("d"))}
                      AND ${predicate(personPred.forTable("p"))}
                      AND daterange(pl.start_date, pl.end_date, '[]') @> ${bind(statDay)})
SELECT count(row.child_id)
       FILTER ( WHERE row.age < 3)  AS under_3_count,
       count(row.child_id)
       FILTER ( WHERE row.age >= 3) AS over_3_count
FROM child_rows row
                """
                )
            }
            .exactlyOne<AgeDivisionCount>()
    }

    fun Database.Read.getEffectiveCareDayCounts(
        range: FiniteDateRange,
        daycarePred: Predicate = Predicate.alwaysTrue(),
    ): AgeDivisionCount {
        val holidays = getHolidays(range)
        return createQuery {
                sql(
                    """
WITH unit_operational_days AS (SELECT d.id AS unit_id, date
                               FROM generate_series(${bind(range.start)}, ${bind(range.end)}, interval '1 day') date
                                        JOIN daycare d ON extract(isodow from date) = ANY
                                                          (coalesce(d.shift_care_operation_days, d.operation_days))
                               WHERE ${predicate(daycarePred.forTable("d"))}),
     effective_placements AS (SELECT od.date,
                                     od.unit_id,
                                     b.child_id,
                                     pl.type                                          AS placement_type,
                                     date_part('year', age(od.date, p.date_of_birth)) as age,
                                     sn.shift_care = ANY ('{FULL,INTERMITTENT}')      AS has_shift_care
                              FROM unit_operational_days od
                                       JOIN backup_care b
                                            ON b.unit_id = od.unit_id AND od.date BETWEEN b.start_date AND b.end_date
                                       JOIN placement pl
                                            ON pl.child_id = b.child_id
                                                AND od.date BETWEEN pl.start_date AND pl.end_date
                                                AND pl.type = ANY ('{DAYCARE,PRESCHOOL_DAYCARE,PRESCHOOL_DAYCARE_ONLY}')
                                       JOIN person p ON pl.child_id = p.id
                                       LEFT JOIN service_need sn ON sn.placement_id = p.id AND
                                                                    od.date BETWEEN sn.start_date AND sn.end_date

                              UNION ALL

                              SELECT od.date,
                                     od.unit_id,
                                     pl.child_id,
                                     pl.type                                          AS placement_type,
                                     date_part('year', age(od.date, p.date_of_birth)) AS age,
                                     sn.shift_care = ANY ('{FULL,INTERMITTENT}')      AS has_shift_care
                              FROM unit_operational_days od
                                       JOIN placement pl
                                            ON pl.unit_id = od.unit_id
                                                AND od.date BETWEEN pl.start_date AND pl.end_date
                                                AND pl.type = ANY ('{DAYCARE,PRESCHOOL_DAYCARE,PRESCHOOL_DAYCARE_ONLY}')
                                       JOIN person p ON pl.child_id = p.id
                                       LEFT JOIN service_need sn 
                                           ON sn.placement_id = pl.id 
                                               AND od.date BETWEEN sn.start_date AND sn.end_date
                                       LEFT JOIN backup_care b
                                           ON b.child_id = pl.child_id
                                               AND od.date BETWEEN b.start_date AND b.end_date
                              WHERE b.child_id IS NULL)
SELECT count(CASE WHEN ep.age < 3 THEN 1 END )  AS under_3_count,
       count(CASE WHEN ep.age >= 3 THEN 1 END ) AS over_3_count
FROM effective_placements ep
         JOIN daycare d ON ep.unit_id = d.id
WHERE NOT EXISTS (SELECT 1
                  FROM absence
                  WHERE child_id = ep.child_id
                    AND date = ep.date
                  HAVING count(category) >= cardinality(absence_categories(ep.placement_type)))
  AND (
    ep.has_shift_care OR extract(isodow FROM ep.date) = ANY (d.operation_days)
    )
  AND (
    (ep.has_shift_care AND d.shift_care_open_on_holidays) OR ep.date != ALL (${bind(holidays)})
    )
    """
                )
            }
            .exactlyOne<AgeDivisionCount>()
    }
}
