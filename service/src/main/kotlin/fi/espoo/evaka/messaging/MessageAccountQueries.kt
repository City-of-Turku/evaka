// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.messaging

import fi.espoo.evaka.shared.DatabaseTable
import fi.espoo.evaka.shared.EmployeeId
import fi.espoo.evaka.shared.GroupId
import fi.espoo.evaka.shared.MessageAccountId
import fi.espoo.evaka.shared.MessageContentId
import fi.espoo.evaka.shared.MessageDraftId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.security.actionrule.AccessControlFilter
import fi.espoo.evaka.shared.security.actionrule.forTable

fun Database.Read.getCitizenMessageAccount(personId: PersonId): MessageAccountId {
    val sql =
        """
SELECT acc.id FROM message_account acc
WHERE acc.person_id = :personId AND acc.active = true
"""
    return this.createQuery(sql).bind("personId", personId).mapTo<MessageAccountId>().exactlyOne()
}

fun Database.Read.getEmployeeMessageAccountIds(
    idFilter: AccessControlFilter<MessageAccountId>
): Set<MessageAccountId> {
    return createQuery<DatabaseTable> {
            sql(
                """
SELECT id
FROM message_account
WHERE (${predicate(idFilter.forTable("message_account"))})
        """
                    .trimIndent()
            )
        }
        .mapTo<MessageAccountId>()
        .toSet()
}

fun Database.Read.getAuthorizedMessageAccountsForEmployee(
    idFilter: AccessControlFilter<MessageAccountId>,
    municipalAccountName: String,
    serviceWorkerAccountName: String
): Set<AuthorizedMessageAccount> {
    val accountIds = getEmployeeMessageAccountIds(idFilter)

    val sql =
        """
SELECT
    acc.id AS account_id,
    (CASE
        WHEN acc.type = 'MUNICIPAL'::message_account_type THEN :municipalAccountName
        WHEN acc.type = 'SERVICE_WORKER'::message_account_type THEN :serviceWorkerAccountName
        ELSE name_view.name
    END) AS account_name,
    acc.type AS account_type,
    dg.id AS group_id,
    dg.name AS group_name,
    dc.id AS group_unitId,
    dc.name AS group_unitName
FROM message_account acc
    JOIN message_account_view name_view ON name_view.id = acc.id
    LEFT JOIN daycare_group dg ON acc.daycare_group_id = dg.id
    LEFT JOIN daycare dc ON dc.id = dg.daycare_id
    LEFT JOIN daycare_acl acl ON acc.employee_id = acl.employee_id AND (acl.role = 'UNIT_SUPERVISOR' OR acl.role = 'SPECIAL_EDUCATION_TEACHER' OR acl.role = 'EARLY_CHILDHOOD_EDUCATION_SECRETARY')
    LEFT JOIN daycare supervisor_dc ON supervisor_dc.id = acl.daycare_id
WHERE acc.id = ANY(:accountIds)
AND (
    'MESSAGING' = ANY(dc.enabled_pilot_features)
    OR 'MESSAGING' = ANY(supervisor_dc.enabled_pilot_features)
    OR acc.type = 'MUNICIPAL'
    OR acc.type = 'SERVICE_WORKER'
)
"""
    return this.createQuery(sql)
        .bind("accountIds", accountIds)
        .bind("municipalAccountName", municipalAccountName)
        .bind("serviceWorkerAccountName", serviceWorkerAccountName)
        .mapTo<AuthorizedMessageAccount>()
        .toSet()
}

fun Database.Read.getAccountNames(
    accountIds: Set<MessageAccountId>,
    serviceWorkerAccountName: String
): List<String> {
    val sql =
        """
        SELECT CASE mav.type WHEN 'SERVICE_WORKER' THEN :serviceWorkerAccountName ELSE mav.name END as name
        FROM message_account_view mav
        WHERE mav.id = ANY(:ids)
    """
            .trimIndent()

    return this.createQuery(sql)
        .bind("ids", accountIds)
        .bind("serviceWorkerAccountName", serviceWorkerAccountName)
        .mapTo<String>()
        .toList()
}

fun Database.Transaction.createDaycareGroupMessageAccount(
    daycareGroupId: GroupId
): MessageAccountId {
    // language=SQL
    val sql =
        """
        INSERT INTO message_account (daycare_group_id, type) VALUES (:daycareGroupId, 'GROUP')
        RETURNING id
    """
            .trimIndent()
    return createQuery(sql)
        .bind("daycareGroupId", daycareGroupId)
        .mapTo<MessageAccountId>()
        .exactlyOne()
}

fun Database.Transaction.deleteDaycareGroupMessageAccount(daycareGroupId: GroupId) {
    // language=SQL
    val sql =
        """
        DELETE FROM message_account WHERE daycare_group_id = :daycareGroupId
    """
            .trimIndent()
    createUpdate(sql).bind("daycareGroupId", daycareGroupId).execute()
}

fun Database.Transaction.createPersonMessageAccount(personId: PersonId): MessageAccountId {
    // language=SQL
    val sql =
        """
        INSERT INTO message_account (person_id, type) VALUES (:personId, 'CITIZEN')
        RETURNING id
    """
            .trimIndent()
    return createQuery(sql).bind("personId", personId).mapTo<MessageAccountId>().exactlyOne()
}

fun Database.Transaction.upsertEmployeeMessageAccount(
    employeeId: EmployeeId,
    accountType: AccountType = AccountType.PERSONAL
): MessageAccountId {
    // language=SQL
    val sql =
        """
        INSERT INTO message_account (employee_id, type) VALUES (:employeeId, :accountType)
        ON CONFLICT (employee_id) WHERE employee_id IS NOT NULL DO UPDATE SET active = true
        RETURNING id
    """
            .trimIndent()
    return createQuery(sql)
        .bind("employeeId", employeeId)
        .bind("accountType", accountType)
        .mapTo<MessageAccountId>()
        .exactlyOne()
}

fun Database.Transaction.deactivateEmployeeMessageAccount(employeeId: EmployeeId) {
    // language=SQL
    val sql =
        """
        UPDATE message_account SET active = false
        WHERE employee_id = :employeeId
    """
            .trimIndent()
    createUpdate(sql).bind("employeeId", employeeId).execute()
}

fun Database.Read.getMessageAccountType(accountId: MessageAccountId): AccountType {
    return this.createQuery("SELECT type FROM message_account WHERE id = :accountId")
        .bind("accountId", accountId)
        .mapTo<AccountType>()
        .exactlyOne()
}

fun Database.Read.findMessageAccountIdByDraftId(id: MessageDraftId): MessageAccountId? =
    createQuery("SELECT account_id FROM message_draft WHERE id = :id")
        .bind("id", id)
        .mapTo<MessageAccountId>()
        .findOne()
        .orElse(null)

fun Database.Read.getMessageAccountIdsByContentId(id: MessageContentId): List<MessageAccountId> =
    createQuery(
            """
SELECT msg.sender_id
FROM message_content content
JOIN message msg ON content.id = msg.content_id
WHERE content.id = :id
UNION
SELECT rec.recipient_id
FROM message_content content
JOIN message msg ON content.id = msg.content_id
JOIN message_recipients rec ON msg.id = rec.message_id
WHERE content.id = :id
        """
                .trimIndent()
        )
        .bind("id", id)
        .mapTo<MessageAccountId>()
        .toList()

fun Database.Read.getServiceWorkerAccountId(): MessageAccountId? =
    createQuery("SELECT id FROM message_account WHERE type = 'SERVICE_WORKER'")
        .mapTo<MessageAccountId>()
        .findOne()
        .orElse(null)
