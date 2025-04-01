// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.document.childdocument

import fi.espoo.evaka.Audit
import fi.espoo.evaka.AuditId
import fi.espoo.evaka.children.getCitizenChildIds
import fi.espoo.evaka.process.updateDocumentProcessHistory
import fi.espoo.evaka.shared.ChildDocumentId
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.BadRequest
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.NotFound
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/citizen/child-documents")
class ChildDocumentControllerCitizen(
    private val accessControl: AccessControl,
    private val childDocumentService: ChildDocumentService,
) {
    @GetMapping
    fun getDocuments(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @RequestParam childId: ChildId,
    ): List<ChildDocumentCitizenSummary> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Child.READ_CHILD_DOCUMENTS,
                        childId,
                    )
                    tx.getChildDocumentCitizenSummaries(user, childId)
                }
            }
            .also { Audit.ChildDocumentRead.log(targetId = AuditId(childId)) }
    }

    @GetMapping("/{documentId}")
    fun getDocument(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable documentId: ChildDocumentId,
    ): ChildDocumentCitizenDetails {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.ChildDocument.READ,
                        documentId,
                    )

                    tx.getCitizenChildDocument(documentId)
                        ?: throw NotFound("Document $documentId not found")
                }
            }
            .also { Audit.ChildDocumentRead.log(targetId = AuditId(documentId)) }
    }

    @GetMapping("/{documentId}/pdf")
    fun downloadChildDocument(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable documentId: ChildDocumentId,
    ): ResponseEntity<Any> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.ChildDocument.DOWNLOAD,
                        documentId,
                    )
                    childDocumentService.getPdfResponse(tx, documentId)
                }
            }
            .also { Audit.ChildDocumentDownload.log(targetId = AuditId(documentId)) }
    }

    @PutMapping("/{documentId}/read")
    fun putDocumentRead(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable documentId: ChildDocumentId,
    ) {
        return db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.ChildDocument.READ,
                        documentId,
                    )

                    tx.markChildDocumentAsRead(user, documentId, clock.now())
                }
            }
            .also { Audit.ChildDocumentMarkRead.log(targetId = AuditId(documentId)) }
    }

    @GetMapping("/unread-count")
    fun getUnreadDocumentsCount(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
    ): Map<ChildId, Int> {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.Person.READ_CHILD_DOCUMENTS_UNREAD_COUNT,
                        user.id,
                    )
                    val children = tx.getCitizenChildIds(clock.today(), user.id)

                    children.associateWith { childId ->
                        tx.getChildDocumentCitizenSummaries(user, childId).count { it.unread }
                    }
                }
            }
            .also { Audit.ChildDocumentUnreadCount.log(targetId = AuditId(user.id)) }
    }

    @PutMapping("/{documentId}/content")
    fun updateChildDocumentContent(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable documentId: ChildDocumentId,
        @RequestBody body: DocumentContent,
    ) {
        db.connect { dbc ->
            dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.ChildDocument.UPDATE,
                        documentId,
                    )
                    val document =
                        tx.getChildDocument(documentId)
                            ?: throw NotFound("Document $documentId not found")

                    if (!document.status.citizenEditable)
                        throw BadRequest("Cannot update contents of document in this status")

                    validateContentAgainstTemplate(body, document.template.content)

                    tx.updateChildDocumentPublishedContent(
                        documentId,
                        document.status,
                        body,
                        clock.now(),
                        user.evakaUserId,
                    )
                }
                .also {
                    Audit.ChildDocumentUpdatePublishedContent.log(targetId = AuditId(documentId))
                }
        }
    }

    @PutMapping("/{documentId}/next-status")
    fun nextDocumentStatus(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable documentId: ChildDocumentId,
        @RequestBody body: ChildDocumentController.StatusChangeRequest,
    ) {
        db.connect { dbc ->
                dbc.transaction { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.Citizen.ChildDocument.NEXT_STATUS,
                        documentId,
                    )
                    val statusTransition =
                        validateStatusTransition(
                            tx = tx,
                            documentId = documentId,
                            requestedStatus = body.newStatus,
                            goingForward = true,
                        )

                    tx.changeStatusAndSetAnswered(
                        documentId,
                        statusTransition,
                        clock.now(),
                        user.evakaUserId,
                    )
                    updateDocumentProcessHistory(
                        tx = tx,
                        documentId = documentId,
                        newStatus = statusTransition.newStatus,
                        now = clock.now(),
                        userId = user.evakaUserId,
                    )
                }
            }
            .also {
                Audit.ChildDocumentNextStatus.log(
                    targetId = AuditId(documentId),
                    meta = mapOf("newStatus" to body.newStatus),
                )
                Audit.ChildDocumentPublish.log(targetId = AuditId(documentId))
            }
    }
}
