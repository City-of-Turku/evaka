// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.application.notes

import fi.espoo.evaka.application.ApplicationNote
import fi.espoo.evaka.shared.ApplicationId
import fi.espoo.evaka.shared.ApplicationNoteId
import fi.espoo.evaka.shared.EvakaUserId
import fi.espoo.evaka.shared.MessageContentId
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.HelsinkiDateTime

fun Database.Read.getApplicationNotes(applicationId: ApplicationId): List<ApplicationNote> =
    createQuery {
            sql(
                """
SELECT 
    n.id, n.application_id, n.content, 
    n.created_at, n.created_by, (SELECT name FROM evaka_user WHERE id = n.created_by) AS created_by_name,
    n.modified_at, n.modified_by, (SELECT name FROM evaka_user WHERE id = n.modified_by) AS modified_by_name,
    n.message_content_id, m.thread_id as message_thread_id
FROM application_note n
LEFT JOIN message m ON m.content_id = n.message_content_id
WHERE application_id = ${bind(applicationId)}
ORDER BY n.created_at
"""
            )
        }
        .toList()

fun Database.Read.getApplicationSpecialEducationTeacherNotes(
    applicationId: ApplicationId
): List<ApplicationNote> =
    createQuery {
            sql(
                """
SELECT
    n.id, n.application_id, n.content,
    n.created_at, n.created_by, (SELECT name FROM evaka_user WHERE id = n.created_by) AS created_by_name,
    n.modified_at, n.modified_by, (SELECT name FROM evaka_user WHERE id = n.modified_by) AS modified_by_name
FROM application_note n
WHERE application_id = ${bind(applicationId)}
AND created_by IN (SELECT employee_id FROM daycare_acl WHERE role = 'SPECIAL_EDUCATION_TEACHER'::user_role)
ORDER BY n.created
"""
            )
        }
        .toList()

fun Database.Transaction.createApplicationNote(
    now: HelsinkiDateTime,
    applicationId: ApplicationId,
    content: String,
    createdBy: EvakaUserId,
    messageContentId: MessageContentId? = null,
): ApplicationNote =
    createQuery {
            sql(
                """
WITH new_note AS (
    INSERT INTO application_note (application_id, content, created_at, created_by, modified_at, modified_by, message_content_id) 
    VALUES (${bind(applicationId)}, ${bind(content)}, ${bind(now)}, ${bind(createdBy)}, ${bind(now)}, ${bind(createdBy)}, ${bind(messageContentId)})
    RETURNING *
) 
SELECT
    n.id,
    n.application_id,
    n.content,
    n.created_at,
    n.created_by,
    eu.name AS created_by_name,
    n.modified_at,
    n.modified_by,
    eu.name AS modified_by_name
FROM new_note n
LEFT JOIN evaka_user eu ON n.created_by = eu.id
"""
            )
        }
        .exactlyOne()

fun Database.Transaction.updateApplicationNote(
    id: ApplicationNoteId,
    content: String,
    modifiedBy: EvakaUserId,
    now: HelsinkiDateTime,
): ApplicationNote =
    createQuery {
            sql(
                """
WITH updated_note AS (
    UPDATE application_note SET content = ${bind(content)}, modified_at = ${bind(now)}, modified_by = ${bind(modifiedBy)}
    WHERE id = ${bind(id)}
    RETURNING *
)
SELECT 
    n.id, n.application_id, n.content, 
    n.created_at, n.created_by, (SELECT name FROM evaka_user WHERE id = n.created_by) AS created_by_name,
    n.modified_at, n.modified_by, (SELECT name FROM evaka_user WHERE id = n.modified_by) AS modified_by_name
FROM updated_note n
"""
            )
        }
        .exactlyOne()

fun Database.Read.getServiceWorkerApplicationNote(id: ApplicationId) =
    createQuery {
            sql("SELECT application.service_worker_note FROM application WHERE id = ${bind(id)}")
        }
        .exactlyOne<String>()

fun Database.Transaction.updateServiceWorkerApplicationNote(id: ApplicationId, content: String) =
    createUpdate {
            sql(
                "UPDATE application SET service_worker_note = ${bind(content)} WHERE id = ${bind(id)}"
            )
        }
        .updateExactlyOne()

fun Database.Transaction.deleteApplicationNote(id: ApplicationNoteId) = execute {
    sql("DELETE FROM application_note WHERE id = ${bind(id)}")
}
