// SPDX-FileCopyrightText: 2018-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.application

import fi.espoo.evaka.Audit
import fi.espoo.evaka.decision.Decision
import fi.espoo.evaka.decision.DecisionService
import fi.espoo.evaka.decision.DecisionStatus
import fi.espoo.evaka.decision.DecisionType
import fi.espoo.evaka.decision.getOwnDecisions
import fi.espoo.evaka.decision.getSentDecision
import fi.espoo.evaka.decision.getSentDecisionsByApplication
import fi.espoo.evaka.pis.getPersonById
import fi.espoo.evaka.pis.isDuplicate
import fi.espoo.evaka.pis.service.PersonService
import fi.espoo.evaka.shared.ApplicationId
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.DecisionId
import fi.espoo.evaka.shared.FeatureConfig
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.BadRequest
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.NotFound
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import fi.espoo.evaka.shared.security.actionrule.AccessControlFilter
import java.time.LocalDate
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/citizen")
class ApplicationControllerCitizen(
    private val accessControl: AccessControl,
    private val featureConfig: FeatureConfig,
    private val applicationStateService: ApplicationStateService,
    private val decisionService: DecisionService,
    private val personService: PersonService
) {

    @GetMapping("/applications/by-guardian")
    fun getGuardianApplications(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock
    ): List<ApplicationsOfChild> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Person.READ_APPLICATIONS,
                        user.id
                    )
                    val allApplications = tx.fetchApplicationSummariesForCitizen(user.id)
                    val allPermittedActions: Map<ApplicationId, Set<Action.Citizen.Application>> =
                        accessControl.getPermittedActions(
                            tx,
                            user,
                            clock,
                            allApplications.map { it.applicationId }
                        )
                    val existingApplicationsByChild = allApplications.groupBy { it.childId }

                    // Some children might not have applications, so add 0 application children
                    tx.getCitizenChildren(clock.today(), user.id).map { child ->
                        val applications = existingApplicationsByChild[child.id] ?: emptyList()
                        val permittedActions =
                            applications.associate { application ->
                                application.applicationId to
                                    (allPermittedActions[application.applicationId] ?: emptySet())
                            }
                        ApplicationsOfChild(
                            childId = child.id,
                            childName = "${child.firstName} ${child.lastName}",
                            applicationSummaries = applications,
                            permittedActions = permittedActions,
                            duplicateOf = child.duplicateOf,
                        )
                    }
                }
            }
            .also { Audit.ApplicationRead.log(targetId = user.id) }
    }

    @GetMapping("/applications/children")
    fun getApplicationChildren(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock
    ): List<CitizenChildren> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Person.READ_APPLICATION_CHILDREN,
                        user.id
                    )
                    tx.getCitizenChildren(clock.today(), user.id)
                }
            }
            .also { Audit.ApplicationRead.log(targetId = user.id) }
    }

    @GetMapping("/applications/{applicationId}")
    fun getApplication(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId
    ): ApplicationDetails {
        val application =
            db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Application.READ,
                        applicationId
                    )

                    fetchApplicationDetailsWithCurrentOtherGuardianInfoAndFilteredAttachments(
                        user,
                        tx,
                        personService,
                        applicationId
                    )
                }
            }
        Audit.ApplicationRead.log(targetId = applicationId)

        return if (application?.hideFromGuardian == false) {
            if (user.id == application.guardianId) {
                application
            } else {
                hideCriticalApplicationInfoFromOtherGuardian(application)
            }
        } else {
            throw NotFound("Application not found")
        }
    }

    @PostMapping("/applications")
    fun createApplication(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @RequestBody body: CreateApplicationBody
    ): ApplicationId {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Child.CREATE_APPLICATION,
                        body.childId
                    )
                    if (
                        body.type != ApplicationType.CLUB &&
                            tx.duplicateApplicationExists(
                                guardianId = user.id,
                                childId = body.childId,
                                type = body.type
                            )
                    ) {
                        throw BadRequest("Duplicate application")
                    }

                    val guardian =
                        tx.getPersonById(user.id)
                            ?: throw IllegalStateException("Guardian not found")

                    val child =
                        tx.getPersonById(body.childId)
                            ?: throw IllegalStateException("Child not found")

                    if (tx.isDuplicate(child.id)) {
                        throw IllegalStateException("Child is duplicate")
                    }

                    tx.insertApplication(
                            type = body.type,
                            guardianId = user.id,
                            childId = body.childId,
                            origin = ApplicationOrigin.ELECTRONIC,
                        )
                        .also {
                            applicationStateService.initializeApplicationForm(
                                tx,
                                user,
                                clock.today(),
                                clock.now(),
                                it,
                                body.type,
                                guardian,
                                child
                            )
                        }
                }
            }
            .also { applicationId ->
                Audit.ApplicationCreate.log(
                    targetId = body.childId,
                    objectId = applicationId,
                    meta = mapOf("guardianId" to user.id, "applicationType" to body.type)
                )
            }
    }

    @GetMapping("/applications/duplicates/{childId}")
    fun getChildDuplicateApplications(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable childId: ChildId
    ): Map<ApplicationType, Boolean> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Child.READ_DUPLICATE_APPLICATIONS,
                        childId
                    )
                    ApplicationType.values()
                        .map { type ->
                            type to
                                (type != ApplicationType.CLUB &&
                                    tx.duplicateApplicationExists(
                                        guardianId = user.id,
                                        childId = childId,
                                        type = type
                                    ))
                        }
                        .toMap()
                }
            }
            .also { Audit.ApplicationReadDuplicates.log(targetId = user.id, objectId = childId) }
    }

    @GetMapping("/applications/active-placements/{childId}")
    fun getChildPlacementStatusByApplicationType(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable childId: ChildId
    ): Map<ApplicationType, Boolean> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Child.READ_PLACEMENT_STATUS_BY_APPLICATION_TYPE,
                        childId
                    )
                    ApplicationType.values()
                        .map { type ->
                            type to
                                tx.activePlacementExists(
                                    childId = childId,
                                    type = type,
                                    today = clock.today()
                                )
                        }
                        .toMap()
                }
            }
            .also { Audit.ApplicationReadActivePlacementsByType.log(targetId = childId) }
    }

    @PutMapping("/applications/{applicationId}")
    fun updateApplication(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId,
        @RequestBody update: CitizenApplicationUpdate
    ) {
        db.connect { dbc ->
            dbc.transaction {
                accessControl.requirePermissionFor(
                    it,
                    user,
                    clock,
                    Action.Citizen.Application.UPDATE,
                    applicationId
                )
                applicationStateService.updateOwnApplicationContentsCitizen(
                    it,
                    user,
                    clock.now(),
                    applicationId,
                    update
                )
            }
        }
        Audit.ApplicationUpdate.log(targetId = applicationId)
    }

    @PutMapping("/applications/{applicationId}/draft")
    fun saveApplicationAsDraft(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId,
        @RequestBody applicationForm: ApplicationFormUpdate
    ) {
        db.connect { dbc ->
            dbc.transaction {
                accessControl.requirePermissionFor(
                    it,
                    user,
                    clock,
                    Action.Citizen.Application.UPDATE,
                    applicationId
                )
                applicationStateService.updateOwnApplicationContentsCitizen(
                    it,
                    user,
                    clock.now(),
                    applicationId,
                    CitizenApplicationUpdate(applicationForm, allowOtherGuardianAccess = false),
                    asDraft = true
                )
            }
        }
        Audit.ApplicationUpdate.log(targetId = applicationId)
    }

    @DeleteMapping("/applications/{applicationId}")
    fun deleteOrCancelUnprocessedApplication(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId
    ) {
        db.connect { dbc ->
            dbc.transaction { tx ->
                val application =
                    tx.fetchApplicationDetails(applicationId)
                        ?: throw NotFound(
                            "Application $applicationId of guardian ${user.id} not found"
                        )

                when (application.status) {
                    ApplicationStatus.CREATED -> {
                        accessControl.requirePermissionFor(
                            tx,
                            user,
                            clock,
                            Action.Citizen.Application.DELETE,
                            applicationId
                        )
                        tx.deleteApplication(applicationId)
                    }
                    ApplicationStatus.SENT ->
                        applicationStateService.cancelApplication(tx, user, clock, applicationId)
                    else ->
                        throw BadRequest(
                            "Only applications which are not yet being processed can be cancelled"
                        )
                }
            }
        }
        Audit.ApplicationDelete.log(targetId = applicationId)
    }

    @PostMapping("/applications/{applicationId}/actions/send-application")
    fun sendApplication(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId
    ) {
        db.connect { dbc ->
            dbc.transaction {
                applicationStateService.sendApplication(it, user, clock, applicationId)
            }
        }
    }

    @GetMapping("/decisions")
    fun getDecisions(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock
    ): List<ApplicationDecisions> {
        return db.connect { dbc ->
                dbc.read {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.Citizen.Person.READ_DECISIONS,
                        user.id
                    )
                    it.getOwnDecisions(user.id)
                }
            }
            .also { Audit.DecisionRead.log(targetId = user.id, meta = mapOf("count" to it.size)) }
    }

    data class DecisionWithValidStartDatePeriod(
        val decision: Decision,
        val validRequestedStartDatePeriod: FiniteDateRange
    )

    @GetMapping("/applications/{applicationId}/decisions")
    fun getApplicationDecisions(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId
    ): List<DecisionWithValidStartDatePeriod> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Application.READ_DECISIONS,
                        applicationId
                    )
                    tx.fetchApplicationDetails(applicationId)
                        ?: throw NotFound("Application not found")
                    tx.getSentDecisionsByApplication(applicationId, AccessControlFilter.PermitAll)
                        .map {
                            DecisionWithValidStartDatePeriod(
                                it,
                                it.validRequestedStartDatePeriod(featureConfig)
                            )
                        }
                }
            }
            .also {
                Audit.DecisionReadByApplication.log(
                    targetId = applicationId,
                    meta = mapOf("count" to it.size)
                )
            }
    }

    @PostMapping("/applications/{applicationId}/actions/accept-decision")
    fun acceptDecision(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId,
        @RequestBody body: AcceptDecisionRequest
    ) {
        // note: applicationStateService handles logging and authorization
        db.connect { dbc ->
            dbc.transaction {
                applicationStateService.acceptDecision(
                    it,
                    user,
                    clock,
                    applicationId,
                    body.decisionId,
                    body.requestedStartDate
                )
            }
        }
    }

    @PostMapping("/applications/{applicationId}/actions/reject-decision")
    fun rejectDecision(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId,
        @RequestBody body: RejectDecisionRequest
    ) {
        // note: applicationStateService handles logging and authorization
        db.connect { dbc ->
            dbc.transaction {
                applicationStateService.rejectDecision(
                    it,
                    user,
                    clock,
                    applicationId,
                    body.decisionId
                )
            }
        }
    }

    @GetMapping("/decisions/{id}/download", produces = [MediaType.APPLICATION_PDF_VALUE])
    fun downloadDecisionPdf(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable id: DecisionId
    ): ResponseEntity<Any> {
        return db.connect { dbc ->
                val decision =
                    dbc.transaction { tx ->
                        accessControl.requirePermissionFor(
                            tx,
                            user,
                            clock,
                            Action.Citizen.Decision.DOWNLOAD_PDF,
                            id
                        )
                        tx.getSentDecision(id)
                    } ?: throw NotFound("Decision $id does not exist")
                decisionService.getDecisionPdf(dbc, decision)
            }
            .also { Audit.DecisionDownloadPdf.log(targetId = id) }
    }

    @GetMapping("/applications/by-guardian/notifications")
    fun getGuardianApplicationNotifications(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock
    ): Int {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Person.READ_APPLICATION_NOTIFICATIONS,
                        user.id
                    )
                    tx.fetchApplicationNotificationCountForCitizen(user.id)
                }
            }
            .also { Audit.ApplicationReadNotifications.log(targetId = user.id) }
    }
}

data class ApplicationsOfChild(
    val childId: ChildId,
    val childName: String,
    val applicationSummaries: List<CitizenApplicationSummary>,
    val permittedActions: Map<ApplicationId, Set<Action.Citizen.Application>>,
    val duplicateOf: PersonId?,
)

data class CreateApplicationBody(val childId: ChildId, val type: ApplicationType)

data class ApplicationDecisions(
    val applicationId: ApplicationId,
    val childId: ChildId,
    val childName: String,
    val decisions: List<DecisionSummary>
)

data class DecisionSummary(
    val id: DecisionId,
    val type: DecisionType,
    val status: DecisionStatus,
    val sentDate: LocalDate,
    val resolved: LocalDate?
)

private fun hideCriticalApplicationInfoFromOtherGuardian(
    application: ApplicationDetails
): ApplicationDetails =
    application.copy(
        form =
            application.form.copy(
                child =
                    application.form.child.copy(
                        person = application.form.child.person.copy(socialSecurityNumber = null),
                        address = null,
                        futureAddress = null,
                    ),
                guardian =
                    application.form.guardian.copy(
                        person = application.form.guardian.person.copy(socialSecurityNumber = null),
                        address = null,
                        futureAddress = null,
                        phoneNumber = "",
                        email = ""
                    ),
                otherPartner = null,
                otherChildren = emptyList(),
                otherInfo = ""
            )
    )
