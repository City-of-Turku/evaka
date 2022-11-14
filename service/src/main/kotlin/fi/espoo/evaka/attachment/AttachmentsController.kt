// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.attachment

import fi.espoo.evaka.Audit
import fi.espoo.evaka.BucketEnv
import fi.espoo.evaka.EvakaEnv
import fi.espoo.evaka.application.ApplicationStateService
import fi.espoo.evaka.application.utils.exhaust
import fi.espoo.evaka.messaging.findMessageAccountIdByDraftId
import fi.espoo.evaka.messaging.getMessageAccountIdsByContentId
import fi.espoo.evaka.pedagogicaldocument.PedagogicalDocumentNotificationService
import fi.espoo.evaka.s3.ContentTypePattern
import fi.espoo.evaka.s3.Document
import fi.espoo.evaka.s3.DocumentService
import fi.espoo.evaka.s3.checkFileContentTypeAndExtension
import fi.espoo.evaka.shared.ApplicationId
import fi.espoo.evaka.shared.AttachmentId
import fi.espoo.evaka.shared.IncomeId
import fi.espoo.evaka.shared.IncomeStatementId
import fi.espoo.evaka.shared.MessageDraftId
import fi.espoo.evaka.shared.PedagogicalDocumentId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.BadRequest
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.Forbidden
import fi.espoo.evaka.shared.domain.NotFound
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import java.util.UUID
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

@RestController
@RequestMapping("/attachments")
class AttachmentsController(
    private val documentClient: DocumentService,
    private val stateService: ApplicationStateService,
    private val pedagogicalDocumentNotificationService: PedagogicalDocumentNotificationService,
    private val accessControl: AccessControl,
    evakaEnv: EvakaEnv,
    bucketEnv: BucketEnv
) {
    private val filesBucket = bucketEnv.attachments
    private val maxAttachmentsPerUser = evakaEnv.maxAttachmentsPerUser

    @PostMapping("/applications/{applicationId}", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadApplicationAttachmentEmployee(
        db: Database,
        user: AuthenticatedUser,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId,
        @RequestParam type: AttachmentType,
        @RequestPart("file") file: MultipartFile
    ): AttachmentId {
        return db.connect { dbc ->
                dbc.read {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.Application.UPLOAD_ATTACHMENT,
                        applicationId
                    )
                }
                handleFileUpload(
                        dbc,
                        user,
                        AttachmentParent.Application(applicationId),
                        file,
                        defaultAllowedAttachmentContentTypes,
                        type
                    )
                    .also {
                        dbc.transaction { tx ->
                            stateService.reCalculateDueDate(tx, clock.today(), applicationId)
                        }
                    }
            }
            .also { attachmentId ->
                Audit.AttachmentsUploadForApplication.log(
                    targetId = applicationId,
                    objectId = attachmentId,
                    args = mapOf("type" to type.name, "size" to file.size)
                )
            }
    }

    @PostMapping(
        "/income-statements/{incomeStatementId}",
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE]
    )
    fun uploadIncomeStatementAttachmentEmployee(
        db: Database,
        user: AuthenticatedUser,
        clock: EvakaClock,
        @PathVariable incomeStatementId: IncomeStatementId,
        @RequestPart("file") file: MultipartFile
    ): AttachmentId {
        return db.connect { dbc ->
                dbc.read {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.IncomeStatement.UPLOAD_ATTACHMENT,
                        incomeStatementId
                    )
                }
                handleFileUpload(
                    dbc,
                    user,
                    AttachmentParent.IncomeStatement(incomeStatementId),
                    file,
                    defaultAllowedAttachmentContentTypes
                )
            }
            .also { attachmentId ->
                Audit.AttachmentsUploadForIncomeStatement.log(
                    targetId = incomeStatementId,
                    objectId = attachmentId,
                    args = mapOf("size" to file.size)
                )
            }
    }

    @PostMapping(
        value = ["/income/{incomeId}", "/income"],
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE]
    )
    fun uploadIncomeAttachment(
        db: Database,
        user: AuthenticatedUser,
        clock: EvakaClock,
        @PathVariable(required = false) incomeId: IncomeId?,
        @RequestPart("file") file: MultipartFile
    ): AttachmentId {
        return db.connect { dbc ->
                if (incomeId != null) {
                    dbc.read {
                        accessControl.requirePermissionFor(
                            it,
                            user,
                            clock,
                            Action.Income.UPLOAD_ATTACHMENT,
                            incomeId
                        )
                    }
                }
                val attachTo =
                    if (incomeId != null) AttachmentParent.Income(incomeId)
                    else AttachmentParent.None

                handleFileUpload(dbc, user, attachTo, file, defaultAllowedAttachmentContentTypes)
            }
            .also { attachmentId ->
                Audit.AttachmentsUploadForIncome.log(
                    targetId = incomeId,
                    objectId = attachmentId,
                    args = mapOf("size" to file.size)
                )
            }
    }

    @PostMapping("/messages/{draftId}", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadMessageAttachment(
        db: Database,
        user: AuthenticatedUser,
        clock: EvakaClock,
        @PathVariable draftId: MessageDraftId,
        @RequestPart("file") file: MultipartFile
    ): AttachmentId {
        return db.connect { dbc ->
                dbc.read {
                    val accountId = it.findMessageAccountIdByDraftId(draftId) ?: throw NotFound()
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.MessageAccount.ACCESS,
                        accountId
                    )
                }
                handleFileUpload(
                    dbc,
                    user,
                    AttachmentParent.MessageDraft(draftId),
                    file,
                    defaultAllowedAttachmentContentTypes
                )
            }
            .also { attachmentId ->
                Audit.AttachmentsUploadForMessageDraft.log(
                    targetId = draftId,
                    objectId = attachmentId,
                    args = mapOf("size" to file.size)
                )
            }
    }

    @PostMapping(
        "/pedagogical-documents/{documentId}",
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE]
    )
    fun uploadPedagogicalDocumentAttachment(
        db: Database,
        user: AuthenticatedUser,
        clock: EvakaClock,
        @PathVariable documentId: PedagogicalDocumentId,
        @RequestPart("file") file: MultipartFile
    ): AttachmentId {
        return db.connect { dbc ->
                dbc.read {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.PedagogicalDocument.CREATE_ATTACHMENT,
                        documentId
                    )
                }
                handleFileUpload(
                    dbc,
                    user,
                    AttachmentParent.PedagogicalDocument(documentId),
                    file,
                    pedagogicalDocumentAllowedAttachmentContentTypes
                ) { tx ->
                    pedagogicalDocumentNotificationService.maybeScheduleEmailNotification(
                        tx,
                        documentId
                    )
                }
            }
            .also { attachmentId ->
                Audit.AttachmentsUploadForPedagogicalDocument.log(
                    targetId = documentId,
                    objectId = attachmentId,
                    args = mapOf("size" to file.size)
                )
            }
    }

    @PostMapping(
        "/citizen/applications/{applicationId}",
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE]
    )
    fun uploadApplicationAttachmentCitizen(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable applicationId: ApplicationId,
        @RequestParam type: AttachmentType,
        @RequestPart("file") file: MultipartFile
    ): AttachmentId {
        val attachTo = AttachmentParent.Application(applicationId)
        return db.connect { dbc ->
                dbc.read {
                    accessControl.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.Citizen.Application.UPLOAD_ATTACHMENT,
                        applicationId
                    )
                }

                checkAttachmentCount(dbc, attachTo, user)

                handleFileUpload(
                    dbc,
                    user,
                    attachTo,
                    file,
                    defaultAllowedAttachmentContentTypes,
                    type
                ) { tx ->
                    stateService.reCalculateDueDate(tx, clock.today(), applicationId)
                }
            }
            .also { attachmentId ->
                Audit.AttachmentsUploadForApplication.log(
                    targetId = applicationId,
                    objectId = attachmentId,
                    args = mapOf("type" to type.name, "size" to file.size)
                )
            }
    }

    @PostMapping(
        value = ["/citizen/income-statements/{incomeStatementId}", "/citizen/income-statements"],
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE]
    )
    fun uploadAttachmentCitizen(
        db: Database,
        user: AuthenticatedUser.Citizen,
        clock: EvakaClock,
        @PathVariable(required = false) incomeStatementId: IncomeStatementId?,
        @RequestPart("file") file: MultipartFile
    ): AttachmentId {
        return db.connect { dbc ->
                if (incomeStatementId != null) {
                    dbc.read {
                        accessControl.requirePermissionFor(
                            it,
                            user,
                            clock,
                            Action.Citizen.IncomeStatement.UPLOAD_ATTACHMENT,
                            incomeStatementId
                        )
                    }
                }
                val attachTo =
                    if (incomeStatementId != null)
                        AttachmentParent.IncomeStatement(incomeStatementId)
                    else AttachmentParent.None

                checkAttachmentCount(dbc, attachTo, user)
                handleFileUpload(dbc, user, attachTo, file, defaultAllowedAttachmentContentTypes)
            }
            .also { attachmentId ->
                Audit.AttachmentsUploadForIncomeStatement.log(
                    targetId = incomeStatementId,
                    objectId = attachmentId,
                    args = mapOf("size" to file.size)
                )
            }
    }

    private fun checkAttachmentCount(
        db: Database.Connection,
        attachTo: AttachmentParent,
        user: AuthenticatedUser.Citizen
    ) {
        val count =
            db.read {
                when (attachTo) {
                    AttachmentParent.None -> it.userUnparentedAttachmentCount(user.evakaUserId)
                    is AttachmentParent.Application ->
                        it.userApplicationAttachmentCount(attachTo.applicationId, user.evakaUserId)
                    is AttachmentParent.IncomeStatement ->
                        it.userIncomeStatementAttachmentCount(
                            attachTo.incomeStatementId,
                            user.evakaUserId
                        )
                    is AttachmentParent.Income ->
                        it.userIncomeAttachmentCount(attachTo.incomeId, user.evakaUserId)
                    is AttachmentParent.PedagogicalDocument ->
                        it.userPedagogicalDocumentCount(
                            attachTo.pedagogicalDocumentId,
                            user.evakaUserId
                        )
                    is AttachmentParent.MessageDraft,
                    is AttachmentParent.MessageContent -> 0
                }
            }
        if (count >= maxAttachmentsPerUser) {
            throw Forbidden("Too many uploaded files for ${user.id}: $maxAttachmentsPerUser")
        }
    }

    private fun getAndCheckFileName(file: MultipartFile) =
        (file.originalFilename?.takeIf { it.isNotBlank() } ?: throw BadRequest("Filename missing"))

    private fun getFileExtension(name: String) =
        name
            .split(".")
            .also {
                if (it.size == 1) throw BadRequest("Missing file extension", "EXTENSION_MISSING")
            }
            .last()

    private fun handleFileUpload(
        db: Database.Connection,
        user: AuthenticatedUser,
        attachTo: AttachmentParent,
        file: MultipartFile,
        allowedContentTypes: List<ContentTypePattern>,
        type: AttachmentType? = null,
        onSuccess: ((tx: Database.Transaction) -> Unit)? = null
    ): AttachmentId {
        val fileName = getAndCheckFileName(file)
        val contentType =
            checkFileContentTypeAndExtension(
                file.inputStream,
                getFileExtension(fileName),
                allowedContentTypes
            )

        val id = AttachmentId(UUID.randomUUID())
        db.transaction { tx ->
            tx.insertAttachment(user, id, fileName, contentType, attachTo, type = type)
            documentClient.upload(
                filesBucket,
                Document(name = id.toString(), bytes = file.bytes, contentType = contentType)
            )
            if (onSuccess != null) {
                onSuccess(tx)
            }
        }

        return id
    }

    @GetMapping("/{attachmentId}/download/{requestedFilename}")
    fun getAttachment(
        db: Database,
        user: AuthenticatedUser,
        clock: EvakaClock,
        @PathVariable attachmentId: AttachmentId,
        @PathVariable requestedFilename: String
    ): ResponseEntity<Any> {
        val attachment =
            db.connect { dbc ->
                dbc.read {
                    val attachment =
                        it.getAttachment(attachmentId)
                            ?: throw NotFound("Attachment $attachmentId not found")
                    when (attachment.attachedTo) {
                        is AttachmentParent.Application ->
                            accessControl.requirePermissionFor(
                                it,
                                user,
                                clock,
                                Action.Attachment.READ_APPLICATION_ATTACHMENT,
                                attachment.id
                            )
                        is AttachmentParent.Income ->
                            accessControl.requirePermissionFor(
                                it,
                                user,
                                clock,
                                Action.Attachment.READ_INCOME_ATTACHMENT,
                                attachment.id
                            )
                        is AttachmentParent.IncomeStatement,
                        is AttachmentParent.None ->
                            accessControl.requirePermissionFor(
                                it,
                                user,
                                clock,
                                Action.Attachment.READ_INCOME_STATEMENT_ATTACHMENT,
                                attachment.id
                            )
                        is AttachmentParent.MessageContent -> {
                            val accountIds =
                                it.getMessageAccountIdsByContentId(
                                    attachment.attachedTo.messageContentId
                                )
                            accessControl.requirePermissionForSomeTarget(
                                it,
                                user,
                                clock,
                                Action.MessageAccount.ACCESS,
                                accountIds
                            )
                        }
                        is AttachmentParent.MessageDraft -> {
                            val accountId =
                                it.findMessageAccountIdByDraftId(attachment.attachedTo.draftId)
                            accessControl.requirePermissionFor(
                                it,
                                user,
                                clock,
                                Action.MessageAccount.ACCESS,
                                accountId!!
                            )
                        }
                        is AttachmentParent.PedagogicalDocument ->
                            accessControl.requirePermissionFor(
                                it,
                                user,
                                clock,
                                Action.Attachment.READ_PEDAGOGICAL_DOCUMENT_ATTACHMENT,
                                attachment.id
                            )
                    }.exhaust()
                    attachment
                }
            }

        if (requestedFilename != attachment.name)
            throw BadRequest("Requested file name doesn't match actual file name for $attachmentId")

        return documentClient.responseInline(filesBucket, "$attachmentId", attachment.name).also {
            Audit.AttachmentsRead.log(targetId = attachmentId)
        }
    }

    @DeleteMapping(value = ["/{attachmentId}", "/citizen/{attachmentId}"])
    fun deleteAttachmentHandler(
        db: Database,
        user: AuthenticatedUser,
        clock: EvakaClock,
        @PathVariable attachmentId: AttachmentId
    ) {
        db.connect { dbc ->
            dbc.transaction {
                val attachment =
                    it.getAttachment(attachmentId)
                        ?: throw NotFound("Attachment $attachmentId not found")
                when (attachment.attachedTo) {
                    is AttachmentParent.Application ->
                        accessControl.requirePermissionFor(
                            it,
                            user,
                            clock,
                            Action.Attachment.DELETE_APPLICATION_ATTACHMENT,
                            attachment.id
                        )
                    is AttachmentParent.Income ->
                        accessControl.requirePermissionFor(
                            it,
                            user,
                            clock,
                            Action.Attachment.DELETE_INCOME_ATTACHMENT,
                            attachment.id
                        )
                    is AttachmentParent.IncomeStatement,
                    is AttachmentParent.None ->
                        accessControl.requirePermissionFor(
                            it,
                            user,
                            clock,
                            Action.Attachment.DELETE_INCOME_STATEMENT_ATTACHMENT,
                            attachment.id
                        )
                    is AttachmentParent.MessageDraft -> {
                        val accountId =
                            it.findMessageAccountIdByDraftId(attachment.attachedTo.draftId)
                        accessControl.requirePermissionFor(
                            it,
                            user,
                            clock,
                            Action.MessageAccount.ACCESS,
                            accountId!!
                        )
                    }
                    is AttachmentParent.MessageContent ->
                        accessControl.requirePermissionFor(
                            it,
                            user,
                            clock,
                            Action.Attachment.DELETE_MESSAGE_CONTENT_ATTACHMENT,
                            attachment.id
                        )
                    is AttachmentParent.PedagogicalDocument ->
                        accessControl.requirePermissionFor(
                            it,
                            user,
                            clock,
                            Action.Attachment.DELETE_PEDAGOGICAL_DOCUMENT_ATTACHMENT,
                            attachment.id
                        )
                }.exhaust()
                deleteAttachment(it, attachment.id)
                attachment
            }
        }
        Audit.AttachmentsDelete.log(targetId = attachmentId)
    }

    fun deleteAttachment(tx: Database.Transaction, attachmentId: AttachmentId) {
        tx.deleteAttachment(attachmentId)
        documentClient.delete(filesBucket, "$attachmentId")
    }

    private val defaultAllowedAttachmentContentTypes =
        listOf(
            ContentTypePattern.JPEG,
            ContentTypePattern.PNG,
            ContentTypePattern.PDF,
            ContentTypePattern.MSWORD,
            ContentTypePattern.MSWORD_DOCX,
            ContentTypePattern.OPEN_DOCUMENT_TEXT,
            ContentTypePattern.TIKA_MSOFFICE,
            ContentTypePattern.TIKA_OOXML
        )

    private val pedagogicalDocumentAllowedAttachmentContentTypes =
        defaultAllowedAttachmentContentTypes +
            listOf(ContentTypePattern.VIDEO_ANY, ContentTypePattern.AUDIO_ANY)
}
