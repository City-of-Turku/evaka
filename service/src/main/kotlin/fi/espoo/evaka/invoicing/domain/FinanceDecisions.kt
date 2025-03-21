// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.invoicing.domain

import fi.espoo.evaka.ConstList
import fi.espoo.evaka.shared.Id
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import java.time.LocalDate
import java.util.UUID

interface FinanceDecision<Decision : FinanceDecision<Decision>> {
    val id: Id<*>
    val validFrom: LocalDate
    val validTo: LocalDate
    val headOfFamilyId: PersonId
    val validDuring: FiniteDateRange
    val created: HelsinkiDateTime

    fun withId(id: UUID): Decision

    fun withValidity(period: FiniteDateRange): Decision

    fun withCreated(created: HelsinkiDateTime): Decision

    fun contentEquals(decision: Decision, nrOfDaysDecisionCanBeSentInAdvance: Long): Boolean

    fun overlapsWith(other: Decision): Boolean

    fun isAnnulled(): Boolean

    fun isEmpty(): Boolean

    fun annul(): Decision
}

fun <Decision : FinanceDecision<Decision>> updateEndDatesOrAnnulConflictingDecisions(
    newDecisions: List<Decision>,
    conflicting: List<Decision>,
): List<Decision> {
    val fixedConflicts =
        newDecisions
            .sortedBy { it.validFrom }
            .fold(conflicting) { conflicts, newDecision ->
                val updatedConflicts =
                    conflicts
                        .filter { conflict -> conflict.overlapsWith(newDecision) }
                        .map { conflict ->
                            if (newDecision.validFrom <= conflict.validFrom) {
                                conflict.annul()
                            } else {
                                conflict.withValidity(
                                    FiniteDateRange(
                                        conflict.validFrom,
                                        newDecision.validFrom.minusDays(1),
                                    )
                                )
                            }
                        }

                conflicts.map { conflict ->
                    updatedConflicts.find { it.id == conflict.id } ?: conflict
                }
            }

    val (annulledConflicts, nonAnnulledConflicts) = fixedConflicts.partition { it.isAnnulled() }
    val originalConflictsAnnulled =
        conflicting
            .filter { conflict -> annulledConflicts.any { it.id == conflict.id } }
            .map { it.annul() }

    return nonAnnulledConflicts + originalConflictsAnnulled
}

@ConstList("financeDecisionTypes")
enum class FinanceDecisionType {
    FEE_DECISION,
    VOUCHER_VALUE_DECISION,
}
