// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.pedagogicaldocument

import fi.espoo.evaka.Audit
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.PedagogicalDocumentId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.db.mapColumn
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import java.time.LocalDate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/citizen")
class PedagogicalDocumentControllerCitizen(private val accessControl: AccessControl) {
    @GetMapping("/children/{childId}/pedagogical-documents")
    fun getPedagogicalDocumentsForChild(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable childId: ChildId
    ): List<PedagogicalDocumentCitizen> {
        return db.connect { dbc ->
                dbc.read {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.Citizen.Child.READ_PEDAGOGICAL_DOCUMENTS,
                        childId
                    )
                    it.getChildPedagogicalDocuments(childId, user.id).filter { pd ->
                        pd.description.isNotEmpty() || pd.attachments.isNotEmpty()
                    }
                }
            }
            .also {
                Audit.PedagogicalDocumentReadByGuardian.log(
                    targetId = childId,
                    meta = mapOf("count" to it.size)
                )
            }
    }

    @PostMapping("/pedagogical-documents/{documentId}/mark-read")
    fun markPedagogicalDocumentRead(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable documentId: PedagogicalDocumentId
    ) {
        db.connect { dbc ->
            dbc.transaction {
                accessControl.requirePermissionFor(
                    it,
                    user,
                    clock,
                    Action.Citizen.PedagogicalDocument.READ,
                    documentId
                )
                it.markDocumentReadByGuardian(clock, documentId, user.id)
            }
        }
        Audit.PedagogicalDocumentUpdate.log(targetId = documentId)
    }

    @GetMapping("/pedagogical-documents/unread-count")
    fun getUnreadPedagogicalDocumentCount(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock
    ): Map<ChildId, Int> {
        return db.connect { dbc ->
                dbc.transaction {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.Citizen.Person.READ_PEDAGOGICAL_DOCUMENT_UNREAD_COUNTS,
                        user.id
                    )
                    it.countUnreadDocumentsByUser(clock.today(), user.id)
                }
            }
            .also { Audit.PedagogicalDocumentCountUnread.log(targetId = user.id) }
    }
}

private fun Database.Transaction.markDocumentReadByGuardian(
    clock: EvakaClock,
    documentId: PedagogicalDocumentId,
    guardianId: PersonId
) =
    this.createUpdate(
            """
            INSERT INTO pedagogical_document_read (pedagogical_document_id, person_id, read_at)
            VALUES (:documentId, :personId, :now)
            ON CONFLICT(pedagogical_document_id, person_id) DO NOTHING;
        """
                .trimIndent()
        )
        .bind("documentId", documentId)
        .bind("personId", guardianId)
        .bind("now", clock.now())
        .execute()

private fun Database.Read.countUnreadDocumentsByUser(
    today: LocalDate,
    userId: PersonId
): Map<ChildId, Int> =
    this.createQuery(
            """
WITH children AS (
    SELECT child_id FROM guardian WHERE guardian_id = :userId
    UNION
    SELECT child_id FROM foster_parent WHERE parent_id = :userId AND valid_during @> :today
), ready_documents AS (
    SELECT pd.id, pd.child_id
    FROM children c
    JOIN pedagogical_document pd ON c.child_id = pd.child_id
    LEFT JOIN attachment a ON a.pedagogical_document_id = pd.id
    WHERE (LENGTH(pd.description) > 0 OR a.id IS NOT NULL)
)
SELECT d.child_id, count(*) as unread_count
FROM ready_documents d
WHERE NOT EXISTS (
    SELECT 1 FROM pedagogical_document_read pdr
    WHERE pdr.pedagogical_document_id = d.id AND pdr.person_id = :userId
)
GROUP BY d.child_id
"""
        )
        .bind("today", today)
        .bind("userId", userId)
        .map { row -> row.mapColumn<ChildId>("child_id") to row.mapColumn<Int>("unread_count") }
        .toMap()
