// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.process

import fi.espoo.evaka.Audit
import fi.espoo.evaka.AuditId
import fi.espoo.evaka.shared.ArchivedProcessId
import fi.espoo.evaka.shared.ChildDocumentId
import fi.espoo.evaka.shared.EmployeeId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import org.jdbi.v3.core.mapper.Nested
import org.jdbi.v3.core.mapper.PropagateNull
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/employee/process-metadata")
class ProcessMetadataController(private val accessControl: AccessControl) {
    data class EmployeeBasics(
        @PropagateNull val id: EmployeeId,
        val firstName: String,
        val lastName: String,
        val email: String?
    )

    data class ChildDocumentMetadata(
        val process: ArchivedProcess,
        val documentName: String,
        val documentCreatedAt: HelsinkiDateTime?,
        val documentCreatedBy: EmployeeBasics?,
        val confidentialDocument: Boolean,
        val downloadable: Boolean
    )

    // wrapper that is needed because currently returning null
    // from an endpoint is not serialized correctly
    data class ChildDocumentMetadataResponse(val data: ChildDocumentMetadata?)

    @GetMapping("/child-documents/{childDocumentId}")
    fun getChildDocumentMetadata(
        db: Database,
        user: AuthenticatedUser.Employee,
        clock: EvakaClock,
        @PathVariable childDocumentId: ChildDocumentId
    ): ChildDocumentMetadataResponse {
        return db.connect { dbc ->
                dbc.read { tx ->
                    accessControl.requirePermissionFor(
                        tx,
                        user,
                        clock,
                        Action.ChildDocument.READ_METADATA,
                        childDocumentId
                    )
                    val document =
                        tx.getChildDocumentBasics(childDocumentId)
                            ?: return@read ChildDocumentMetadataResponse(null)
                    val process =
                        document.processId?.let { tx.getProcess(it) }
                            ?: return@read ChildDocumentMetadataResponse(null)
                    ChildDocumentMetadataResponse(
                        ChildDocumentMetadata(
                            process = process,
                            documentName = document.name,
                            documentCreatedAt = document.createdAt,
                            documentCreatedBy = document.createdBy,
                            confidentialDocument = document.confidential,
                            downloadable = document.downloadable
                        )
                    )
                }
            }
            .also { response ->
                Audit.ChildDocumentReadMetadata.log(
                    targetId = AuditId(childDocumentId),
                    objectId = response.data?.process?.id?.let(AuditId::invoke)
                )
            }
    }

    private data class ChildDocumentBasics(
        val name: String,
        val confidential: Boolean,
        val processId: ArchivedProcessId?,
        val createdAt: HelsinkiDateTime?,
        @Nested("created_by") val createdBy: EmployeeBasics?,
        val downloadable: Boolean
    )

    private fun Database.Read.getChildDocumentBasics(
        documentId: ChildDocumentId
    ): ChildDocumentBasics? =
        createQuery {
                sql(
                    """
        SELECT 
            dt.name,
            dt.confidential,
            cd.process_id,
            cd.created AS created_at,
            e.id AS created_by_id,
            e.first_name AS created_by_first_name,
            e.last_name AS created_by_last_name,
            e.email AS created_by_email,
            cd.document_key IS NOT NULL AS downloadable
        FROM child_document cd
        JOIN document_template dt ON dt.id = cd.template_id
        LEFT JOIN employee e ON e.id = cd.created_by
        WHERE cd.id = ${bind(documentId)}
    """
                )
            }
            .exactlyOneOrNull()
}
