// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.messaging

import fi.espoo.evaka.shared.AttachmentId
import fi.espoo.evaka.shared.MessageDraftId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database

fun Database.Read.filterPermittedMessageDrafts(user: AuthenticatedUser.Employee, ids: Collection<MessageDraftId>): Set<MessageDraftId> =
    this.createQuery(
        """
SELECT draft.id
FROM message_draft draft
JOIN message_account_access_view access ON access.account_id = draft.account_id
WHERE
    draft.id = ANY(:ids) AND
    access.employee_id = :employeeId
        """.trimIndent()
    )
        .bind("employeeId", user.id)
        .bind("ids", ids.toTypedArray())
        .mapTo<MessageDraftId>()
        .toSet()

fun Database.Read.filterCitizenPermittedAttachmentsThroughMessageContent(personId: PersonId, ids: Collection<AttachmentId>): Set<AttachmentId> =
    this.createQuery(
        """
SELECT att.id
FROM attachment att
JOIN message_content content ON att.message_content_id = content.id
JOIN message msg ON content.id = msg.content_id
JOIN message_recipients rec ON msg.id = rec.message_id
JOIN message_account ma ON ma.id = msg.sender_id OR ma.id = rec.recipient_id
WHERE att.id = ANY(:ids) AND ma.person_id = :personId
        """.trimIndent()
    )
        .bind("personId", personId)
        .bind("ids", ids.toTypedArray())
        .mapTo<AttachmentId>()
        .toSet()

fun Database.Read.filterPermittedAttachmentsThroughMessageContent(user: AuthenticatedUser.Employee, ids: Collection<AttachmentId>): Set<AttachmentId> =
    this.createQuery(
        """
SELECT att.id
FROM attachment att
JOIN message_content content ON att.message_content_id = content.id
JOIN message msg ON content.id = msg.content_id
JOIN message_recipients rec ON msg.id = rec.message_id
JOIN message_account_access_view access ON access.account_id = msg.sender_id OR access.account_id = rec.recipient_id
WHERE att.id = ANY(:ids) AND access.employee_id = :employeeId
        """.trimIndent()
    )
        .bind("employeeId", user.id)
        .bind("ids", ids.toTypedArray())
        .mapTo<AttachmentId>()
        .toSet()

fun Database.Read.filterPermittedAttachmentsThroughMessageDrafts(user: AuthenticatedUser.Employee, ids: Collection<AttachmentId>): Set<AttachmentId> =
    this.createQuery(
        """
SELECT att.id
FROM attachment att
JOIN message_draft draft ON att.message_draft_id = draft.id
JOIN message_account_access_view access ON access.account_id = draft.account_id
WHERE att.id = ANY(:ids) AND access.employee_id = :employeeId
        """.trimIndent()
    )
        .bind("employeeId", user.id)
        .bind("ids", ids.toTypedArray())
        .mapTo<AttachmentId>()
        .toSet()
