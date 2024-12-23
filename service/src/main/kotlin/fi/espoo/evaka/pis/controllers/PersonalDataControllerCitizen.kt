//  SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
//  SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.pis.controllers

import fi.espoo.evaka.Audit
import fi.espoo.evaka.AuditId
import fi.espoo.evaka.EvakaEnv
import fi.espoo.evaka.Sensitive
import fi.espoo.evaka.pis.*
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.PasswordService
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.BadRequest
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import fi.espoo.evaka.shared.utils.EMAIL_PATTERN
import fi.espoo.evaka.shared.utils.PHONE_PATTERN
import fi.espoo.evaka.user.updatePassword
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/citizen/personal-data")
class PersonalDataControllerCitizen(
    private val accessControl: AccessControl,
    private val passwordService: PasswordService,
    private val env: EvakaEnv,
) {
    @PutMapping
    fun updatePersonalData(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @RequestBody body: PersonalDataUpdate,
    ) {
        db.connect { dbc ->
            dbc.transaction { tx ->
                accessControl.requirePermissionFor(
                    tx,
                    user,
                    clock,
                    Action.Citizen.Person.UPDATE_PERSONAL_DATA,
                    user.id,
                )

                val person = tx.getPersonById(user.id) ?: error("User not found")

                val validationErrors =
                    listOfNotNull(
                        "invalid preferredName"
                            .takeUnless {
                                person.firstName.split(" ").contains(body.preferredName)
                            },
                        "invalid phone".takeUnless { PHONE_PATTERN.matches(body.phone) },
                        "invalid backup phone"
                            .takeUnless {
                                body.backupPhone.isBlank() ||
                                    PHONE_PATTERN.matches(body.backupPhone)
                            },
                        "invalid email"
                            .takeUnless {
                                body.email.isBlank() || EMAIL_PATTERN.matches(body.email)
                            },
                    )

                if (validationErrors.isNotEmpty())
                    throw BadRequest(validationErrors.joinToString(", "))

                tx.updatePersonalDetails(user.id, body)
            }
        }
        Audit.PersonalDataUpdate.log(targetId = AuditId(user.id))
    }

    @GetMapping("/notification-settings")
    fun getNotificationSettings(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
    ): Set<EmailMessageType> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Person.READ_NOTIFICATION_SETTINGS,
                        user.id,
                    )
                    tx.getDisabledEmailTypes(user.id)
                }
            }
            .also { Audit.CitizenNotificationSettingsRead.log(targetId = AuditId(user.id)) }
    }

    @PutMapping("/notification-settings")
    fun updateNotificationSettings(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @RequestBody body: Set<EmailMessageType>,
    ) {
        db.connect { dbc ->
            dbc.transaction { tx ->
                accessControl.requirePermissionFor(
                    tx,
                    user,
                    clock,
                    Action.Citizen.Person.UPDATE_NOTIFICATION_SETTINGS,
                    user.id,
                )
                tx.updateDisabledEmailTypes(user.id, body)
            }
        }
        Audit.PersonalDataUpdate.log(targetId = AuditId(user.id))
    }

    data class UpdatePasswordRequest(val password: Sensitive<String>) {
        init {
            if (
                password.value.isEmpty() || password.value.length < 8 || password.value.length > 128
            ) {
                throw BadRequest("Invalid password")
            }
        }
    }

    @PutMapping("/password")
    fun updatePassword(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @RequestBody body: UpdatePasswordRequest,
    ) {
        if (!env.newCitizenWeakLoginEnabled) throw BadRequest("New citizen weak login is disabled")
        Audit.CitizenPasswordUpdateAttempt.log(targetId = AuditId(user.id))
        val password = passwordService.encode(body.password)
        db.connect { dbc ->
            dbc.transaction { tx ->
                accessControl.requirePermissionFor(
                    tx,
                    user,
                    clock,
                    Action.Citizen.Person.UPDATE_PASSWORD,
                    user.id,
                )
                tx.updatePassword(clock, user.id, password)
            }
        }
        Audit.CitizenPasswordUpdate.log(targetId = AuditId(user.id))
    }
}
