// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.holidayperiod

import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.HolidayQuestionnaireId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.db.Predicate
import fi.espoo.evaka.shared.domain.FiniteDateRange
import java.time.LocalDate

private fun Database.Read.questionnaireQuery(where: Predicate): Database.Query = createQuery {
    sql(
        """
SELECT q.id,
       q.type,
       q.absence_type,
       q.requires_strong_auth,
       q.title,
       q.active,
       q.description,
       q.description_link,
       q.period_options,
       q.period_option_label,
       q.period,
       q.absence_type_threshold,
       q.condition_continuous_placement
FROM holiday_period_questionnaire q
WHERE ${predicate(where.forTable("q"))}
"""
    )
}

fun Database.Read.getActiveFixedPeriodQuestionnaire(
    date: LocalDate
): HolidayQuestionnaire.FixedPeriodQuestionnaire? =
    questionnaireQuery(
            Predicate {
                where(
                    "$it.active @> ${bind(date)} AND $it.type = ${bind(QuestionnaireType.FIXED_PERIOD)}"
                )
            }
        )
        .exactlyOneOrNull<HolidayQuestionnaire.FixedPeriodQuestionnaire>()

fun Database.Read.getActiveOpenRangesQuestionnaire(
    date: LocalDate
): HolidayQuestionnaire.OpenRangesQuestionnaire? =
    questionnaireQuery(
            Predicate {
                where(
                    "$it.active @> ${bind(date)} AND $it.type = ${bind(QuestionnaireType.OPEN_RANGES)}"
                )
            }
        )
        .exactlyOneOrNull<HolidayQuestionnaire.OpenRangesQuestionnaire>()

fun Database.Read.getChildrenWithContinuousPlacement(
    today: LocalDate,
    userId: PersonId,
    period: FiniteDateRange,
): List<ChildId> {
    return createQuery {
            sql(
                """
WITH children AS (
    SELECT child_id FROM guardian WHERE guardian_id = ${bind(userId)}
    UNION
    SELECT child_id FROM foster_parent WHERE parent_id = ${bind(userId)} AND valid_during @> ${bind(today)}
)
SELECT c.child_id
FROM children c, generate_series(${bind(period.start)}::date, ${bind(period.end)}::date, '1 day') d
GROUP BY c.child_id
HAVING bool_and(d::date <@ ANY (
    SELECT daterange(p.start_date, p.end_date, '[]')
    FROM placement p
    WHERE p.child_id = c.child_id
))
"""
            )
        }
        .toList<ChildId>()
}

fun Database.Read.getUserChildIds(today: LocalDate, userId: PersonId): List<ChildId> {
    return createQuery {
            sql(
                """
SELECT child_id FROM guardian WHERE guardian_id = ${bind(userId)}
UNION
SELECT child_id FROM foster_parent WHERE parent_id = ${bind(userId)} AND valid_during @> ${bind(today)}
"""
            )
        }
        .toList<ChildId>()
}

fun Database.Read.getFixedPeriodQuestionnaire(
    id: HolidayQuestionnaireId
): HolidayQuestionnaire.FixedPeriodQuestionnaire? =
    questionnaireQuery(
            Predicate {
                where("$it.id = ${bind(id)} AND $it.type = ${bind(QuestionnaireType.FIXED_PERIOD)}")
            }
        )
        .exactlyOneOrNull<HolidayQuestionnaire.FixedPeriodQuestionnaire>()

fun Database.Read.getHolidayQuestionnaires(type: QuestionnaireType): List<HolidayQuestionnaire> =
    when (type) {
        QuestionnaireType.FIXED_PERIOD ->
            questionnaireQuery(
                    Predicate { where("$it.type = ${bind(QuestionnaireType.FIXED_PERIOD)}") }
                )
                .toList<HolidayQuestionnaire.FixedPeriodQuestionnaire>()
        QuestionnaireType.OPEN_RANGES ->
            questionnaireQuery(
                    Predicate { where("$it.type = ${bind(QuestionnaireType.OPEN_RANGES)}") }
                )
                .toList<HolidayQuestionnaire.OpenRangesQuestionnaire>()
    }

fun Database.Transaction.createFixedPeriodQuestionnaire(
    data: QuestionnaireBody.FixedPeriodQuestionnaireBody
): HolidayQuestionnaireId =
    createQuery {
            sql(
                """
INSERT INTO holiday_period_questionnaire (
    type,
    absence_type,
    requires_strong_auth,
    active,
    title,
    description,
    description_link,
    period_options,
    period_option_label,
    condition_continuous_placement
)
VALUES (
    ${bind(QuestionnaireType.FIXED_PERIOD)},
    ${bind(data.absenceType)},
    ${bind(data.requiresStrongAuth)},
    ${bind(data.active)},
    ${bindJson(data.title)},
    ${bindJson(data.description)},
    ${bindJson(data.descriptionLink)},
    ${bind(data.periodOptions)},
    ${bindJson(data.periodOptionLabel)},
    ${bind(data.conditions.continuousPlacement)}
)
RETURNING id
"""
            )
        }
        .exactlyOne<HolidayQuestionnaireId>()

fun Database.Transaction.updateFixedPeriodQuestionnaire(
    id: HolidayQuestionnaireId,
    data: QuestionnaireBody.FixedPeriodQuestionnaireBody,
) =
    createUpdate {
            sql(
                """
UPDATE holiday_period_questionnaire
SET
    type = ${bind(QuestionnaireType.FIXED_PERIOD)},
    absence_type = ${bind(data.absenceType)},
    requires_strong_auth = ${bind(data.requiresStrongAuth)},
    active = ${bind(data.active)},
    title = ${bindJson(data.title)},
    description = ${bindJson(data.description)},
    description_link = ${bindJson(data.descriptionLink)},
    period_options = ${bind(data.periodOptions)},
    period_option_label = ${bindJson(data.periodOptionLabel)},
    condition_continuous_placement = ${bind(data.conditions.continuousPlacement)}
WHERE id = ${bind(id)} AND type = ${bind(QuestionnaireType.FIXED_PERIOD)}
"""
            )
        }
        .updateExactlyOne()

fun Database.Read.getOpenRangesQuestionnaire(
    id: HolidayQuestionnaireId
): HolidayQuestionnaire.OpenRangesQuestionnaire? =
    questionnaireQuery(
            Predicate {
                where("$it.id = ${bind(id)} AND $it.type = ${bind(QuestionnaireType.OPEN_RANGES)}")
            }
        )
        .exactlyOneOrNull<HolidayQuestionnaire.OpenRangesQuestionnaire>()

fun Database.Transaction.createOpenRangesQuestionnaire(
    data: QuestionnaireBody.OpenRangesQuestionnaireBody
): HolidayQuestionnaireId =
    createQuery {
            sql(
                """
INSERT INTO holiday_period_questionnaire (
    type,
    absence_type,
    requires_strong_auth,
    active,
    title,
    description,
    description_link,
    condition_continuous_placement,
    period,
    absence_type_threshold
)
VALUES (
    ${bind(QuestionnaireType.OPEN_RANGES)},
    ${bind(data.absenceType)},
    ${bind(data.requiresStrongAuth)},
    ${bind(data.active)},
    ${bindJson(data.title)},
    ${bindJson(data.description)},
    ${bindJson(data.descriptionLink)},
    ${bind(data.conditions.continuousPlacement)},
    ${bind(data.period)},
    ${bind(data.absenceTypeThreshold)}
)
RETURNING id
                """
                    .trimIndent()
            )
        }
        .exactlyOne<HolidayQuestionnaireId>()

fun Database.Transaction.updateOpenRangesQuestionnaire(
    id: HolidayQuestionnaireId,
    data: QuestionnaireBody.OpenRangesQuestionnaireBody,
) =
    createUpdate {
            sql(
                """
UPDATE holiday_period_questionnaire
SET
    type = ${bind(QuestionnaireType.OPEN_RANGES)},
    absence_type = ${bind(data.absenceType)},
    requires_strong_auth = ${bind(data.requiresStrongAuth)},
    active = ${bind(data.active)},
    title = ${bindJson(data.title)},
    description = ${bindJson(data.description)},
    description_link = ${bindJson(data.descriptionLink)},
    condition_continuous_placement = ${bind(data.conditions.continuousPlacement)},
    period = ${bind(data.period)},
    absence_type_threshold = ${bind(data.absenceTypeThreshold)}
WHERE id = ${bind(id)} AND type = ${bind(QuestionnaireType.OPEN_RANGES)}
"""
            )
        }
        .updateExactlyOne()

fun Database.Transaction.deleteHolidayQuestionnaire(id: HolidayQuestionnaireId) =
    createUpdate { sql("DELETE FROM holiday_period_questionnaire WHERE id = ${bind(id)}") }
        .execute()

fun Database.Transaction.insertQuestionnaireAnswers(
    modifiedBy: PersonId,
    answers: List<HolidayQuestionnaireAnswer>,
) {
    executeBatch(answers) {
        sql(
            """
INSERT INTO holiday_questionnaire_answer (
    questionnaire_id,
    child_id,
    fixed_period,
    open_ranges,
    modified_by
)
VALUES (
    ${bind { it.questionnaireId }},
    ${bind { it.childId }},
    ${bind { it.fixedPeriod }},
    ${bind { it.openRanges }},
    ${bind(modifiedBy)}
)
ON CONFLICT(questionnaire_id, child_id)
    DO UPDATE SET fixed_period = EXCLUDED.fixed_period,
                  open_ranges = EXCLUDED.open_ranges,
                  modified_by  = EXCLUDED.modified_by
"""
        )
    }
}

fun Database.Read.getQuestionnaireAnswers(
    id: HolidayQuestionnaireId,
    childIds: List<ChildId>,
): List<HolidayQuestionnaireAnswer> =
    createQuery {
            sql(
                """
SELECT questionnaire_id, child_id, fixed_period, open_ranges
FROM holiday_questionnaire_answer
WHERE questionnaire_id = ${bind(id)} AND child_id = ANY(${bind(childIds)})
        """
            )
        }
        .toList<HolidayQuestionnaireAnswer>()

fun Database.Read.getQuestionnaireAnswers(
    ids: List<HolidayQuestionnaireId>,
    childIds: List<ChildId>,
): List<HolidayQuestionnaireAnswer> =
    createQuery {
            sql(
                """
SELECT questionnaire_id, child_id, fixed_period, open_ranges
FROM holiday_questionnaire_answer
WHERE questionnaire_id = ANY(${bind(ids)}) AND child_id = ANY(${bind(childIds)})
            """
            )
        }
        .toList<HolidayQuestionnaireAnswer>()
