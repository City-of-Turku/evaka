// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.espoo

import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.security.Action
import fi.espoo.evaka.shared.security.actionrule.ActionRuleMapping
import fi.espoo.evaka.shared.security.actionrule.HasGlobalRole
import fi.espoo.evaka.shared.security.actionrule.HasUnitRole
import fi.espoo.evaka.shared.security.actionrule.IsCitizen
import fi.espoo.evaka.shared.security.actionrule.ScopedActionRule
import fi.espoo.evaka.shared.security.actionrule.UnscopedActionRule

class EspooActionRuleMapping : ActionRuleMapping {
    override fun rulesOf(action: Action.UnscopedAction): Sequence<UnscopedActionRule> =
        when (action) {
            Action.Global.SEND_PATU_REPORT,
            Action.Global.SUBMIT_PATU_REPORT -> sequenceOf(HasGlobalRole(UserRole.ADMIN))
            Action.Global.READ_NON_SSN_CHILDREN_REPORT ->
                sequenceOf(HasGlobalRole(UserRole.ADMIN, UserRole.SERVICE_WORKER))
            Action.Global.READ_TAMPERE_REGIONAL_SURVEY_REPORT -> emptySequence()
            else -> action.defaultRules.asSequence()
        }

    override fun <T> rulesOf(action: Action.ScopedAction<in T>): Sequence<ScopedActionRule<in T>> =
        when (action) {
            Action.Unit.READ_OCCUPANCY_REPORT -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(
                        UserRole.ADMIN,
                        UserRole.SERVICE_WORKER,
                        UserRole.DIRECTOR,
                        UserRole.REPORT_VIEWER,
                    )
                        as ScopedActionRule<in T>
                ) +
                    sequenceOf(
                        HasUnitRole(UserRole.UNIT_SUPERVISOR).inAnyUnit() as ScopedActionRule<in T>
                    )
            }
            Action.Unit.READ_PLACEMENT_GUARANTEE_REPORT -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(HasGlobalRole(UserRole.ADMIN) as ScopedActionRule<in T>) +
                    sequenceOf(
                        HasUnitRole(UserRole.UNIT_SUPERVISOR).inUnit() as ScopedActionRule<in T>
                    )
            }
            Action.Unit.READ_SERVICE_VOUCHER_REPORT -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(UserRole.ADMIN, UserRole.REPORT_VIEWER, UserRole.FINANCE_ADMIN)
                        as ScopedActionRule<in T>
                ) +
                    sequenceOf(
                        HasUnitRole(
                                UserRole.UNIT_SUPERVISOR,
                                UserRole.EARLY_CHILDHOOD_EDUCATION_SECRETARY,
                            )
                            .inUnit() as ScopedActionRule<in T>
                    )
            }
            Action.Unit.READ_FAMILY_DAYCARE_MEAL_REPORT -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(HasGlobalRole(UserRole.ADMIN) as ScopedActionRule<in T>) +
                    sequenceOf(
                        HasUnitRole(UserRole.UNIT_SUPERVISOR).inUnit() as ScopedActionRule<in T>
                    )
            }
            Action.Unit.READ_FAMILY_CONFLICT_REPORT -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(UserRole.ADMIN, UserRole.SERVICE_WORKER, UserRole.FINANCE_ADMIN)
                        as ScopedActionRule<in T>
                )
            }
            Action.Person.CREATE_PARTNERSHIP -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(UserRole.ADMIN, UserRole.SERVICE_WORKER, UserRole.FINANCE_ADMIN)
                        as ScopedActionRule<in T>
                )
            }
            Action.Person.CREATE_PARENTSHIP -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(UserRole.ADMIN, UserRole.SERVICE_WORKER, UserRole.FINANCE_ADMIN)
                        as ScopedActionRule<in T>
                )
            }
            Action.Partnership.UPDATE,
            Action.Partnership.RETRY -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(UserRole.ADMIN, UserRole.SERVICE_WORKER, UserRole.FINANCE_ADMIN)
                        as ScopedActionRule<in T>
                )
            }
            Action.Parentship.UPDATE,
            Action.Parentship.RETRY,
            Action.Parentship.DELETE_CONFLICTED_PARENTSHIP -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(UserRole.ADMIN, UserRole.SERVICE_WORKER, UserRole.FINANCE_ADMIN)
                        as ScopedActionRule<in T>
                )
            }
            Action.Child.READ_DAILY_SERVICE_TIMES -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(UserRole.ADMIN, UserRole.SERVICE_WORKER, UserRole.FINANCE_ADMIN)
                        as ScopedActionRule<in T>
                ) +
                    sequenceOf(
                        HasUnitRole(
                                UserRole.UNIT_SUPERVISOR,
                                UserRole.SPECIAL_EDUCATION_TEACHER,
                                UserRole.STAFF,
                                UserRole.EARLY_CHILDHOOD_EDUCATION_SECRETARY,
                            )
                            .inPlacementUnitOfChild() as ScopedActionRule<in T>
                    )
            }
            Action.Child.CREATE_DAILY_SERVICE_TIME -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(UserRole.ADMIN, UserRole.SERVICE_WORKER, UserRole.FINANCE_ADMIN)
                        as ScopedActionRule<in T>
                ) +
                    sequenceOf(
                        HasUnitRole(
                                UserRole.UNIT_SUPERVISOR,
                                UserRole.SPECIAL_EDUCATION_TEACHER,
                                UserRole.STAFF,
                            )
                            .inPlacementUnitOfChild() as ScopedActionRule<in T>
                    )
            }
            Action.Citizen.Child.READ_DAILY_SERVICE_TIMES -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    IsCitizen(allowWeakLogin = true).guardianOfChild() as ScopedActionRule<in T>
                ) +
                    sequenceOf(
                        IsCitizen(allowWeakLogin = true).fosterParentOfChild()
                            as ScopedActionRule<in T>
                    )
            }
            Action.Invoice.RESEND -> {
                @Suppress("UNCHECKED_CAST")
                sequenceOf(
                    HasGlobalRole(UserRole.ADMIN, UserRole.FINANCE_ADMIN) as ScopedActionRule<in T>
                )
            }
            else -> action.defaultRules.asSequence()
        }
}
