// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.emailclient

import fi.espoo.evaka.pis.EmailMessageType
import fi.espoo.evaka.shared.DatabaseTable
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.db.Database
import mu.KotlinLogging

private val EMAIL_PATTERN = "^([\\w.%+-]+)@([\\w-]+\\.)+([\\w]{2,})\$".toRegex()

private val logger = KotlinLogging.logger {}

class Email
private constructor(
    val toAddress: String,
    val fromAddress: String,
    val content: EmailContent,
    val traceId: String
) {
    fun send(emailClient: EmailClient) {
        emailClient.send(this)
    }

    companion object {
        fun create(
            dbc: Database.Connection,
            personId: PersonId,
            emailType: EmailMessageType,
            fromAddress: String,
            content: EmailContent,
            traceId: String,
        ): Email? {
            val (toAddress, enabledEmailTypes) =
                dbc.read { tx -> tx.getEmailAddressAndEnabledTypes(personId) }

            if (toAddress == null) {
                logger.warn("Will not send email due to missing email address: (traceId: $traceId)")
                return null
            }

            if (!toAddress.matches(EMAIL_PATTERN)) {
                logger.warn(
                    "Will not send email due to invalid toAddress \"$toAddress\": (traceId: $traceId)"
                )
                return null
            }

            if (emailType !in (enabledEmailTypes ?: EmailMessageType.values().toList())) {
                logger.info {
                    "Not sending email (traceId: $traceId): $emailType not enabled for person $personId"
                }
                return null
            }

            return Email(toAddress, fromAddress, content, traceId)
        }
    }
}

interface EmailClient {
    fun send(email: Email)
}

private data class EmailAndEnabledEmailTypes(
    val email: String?,
    val enabledEmailTypes: List<EmailMessageType>?
)

private fun Database.Read.getEmailAddressAndEnabledTypes(
    personId: PersonId
): EmailAndEnabledEmailTypes {
    return createQuery<DatabaseTable> {
            sql("""SELECT email, enabled_email_types FROM person WHERE id = ${bind(personId)}""")
        }
        .mapTo<EmailAndEnabledEmailTypes>()
        .exactlyOne()
}
