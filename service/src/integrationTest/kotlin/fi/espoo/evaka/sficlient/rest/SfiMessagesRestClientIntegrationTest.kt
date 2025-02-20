// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.sficlient.rest

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.Sensitive
import fi.espoo.evaka.SfiContactOrganizationEnv
import fi.espoo.evaka.SfiContactPersonEnv
import fi.espoo.evaka.SfiEnv
import fi.espoo.evaka.SfiPrintingEnv
import fi.espoo.evaka.s3.Document
import fi.espoo.evaka.sficlient.SfiMessage
import java.net.URI
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class SfiMessagesRestClientIntegrationTest : FullApplicationTest(resetDbBeforeEach = false) {
    private fun createEnv() =
        SfiEnv(
            serviceIdentifier = "espoo_ws_vaka",
            printing =
                SfiPrintingEnv(
                    billingId = "billing-username",
                    billingPassword = Sensitive("billing-password"),
                    // dummy fields only used by the SOAP implementation
                    enabled = true,
                    forcePrintForElectronicUser = false,
                    printingProvider = "",
                ),
            contactPerson =
                SfiContactPersonEnv(
                    email = "test@example.com",
                    // dummy fields only used by the SOAP implementation
                    phone = "",
                    name = "",
                ),
            contactOrganization =
                SfiContactOrganizationEnv(
                    name = "eVaka Espoo",
                    streetAddress = "Karaportti 1 PL 302",
                    postalCode = "02070",
                    postOffice = "Espoo",
                ),
            restAddress = URI.create("http://localhost:$httpPort/public/mock-sfi-messages"),
            restUsername = MockSfiMessagesRestEndpoint.USERNAME,
            restPasswordSsmName = null,
        )

    private val message =
        SfiMessage(
            messageId = "message-id",
            documentId = "document-id",
            documentBucket = "document-bucket",
            documentKey = "document-key",
            documentDisplayName = "test.pdf",
            ssn = "010280-952L",
            firstName = "Tessa",
            lastName = "Testilä",
            streetAddress = "Henriksvägen 14 B",
            postalCode = "00370",
            postOffice = "HELSINGFORS",
            countryCode = "FI",
            messageHeader = "message-header",
            messageContent = "message-content",
            emailHeader = "message-header",
            emailContent = "message-content",
        )
    private val fileContent = byteArrayOf(1, 2, 3, 4)
    private lateinit var sfiEnv: SfiEnv
    private lateinit var client: SfiMessagesRestClient

    @BeforeEach
    fun beforeEach() {
        MockSfiMessagesRestEndpoint.reset()
        val fileContent = byteArrayOf(1, 2, 3, 4)
        sfiEnv = createEnv()
        client =
            SfiMessagesRestClient(
                sfiEnv,
                getDocument = { location ->
                    assertEquals(message.documentBucket, location.bucket)
                    assertEquals(message.documentKey, location.key)
                    Document(location.key, fileContent, contentType = "content-type")
                },
                passwordStore =
                    MockPasswordStore(
                        initialPassword = MockSfiMessagesRestEndpoint.DEFAULT_PASSWORD
                    ),
            )
    }

    @Test
    fun `it sends a sfi message successfully`() {
        client.send(message)

        val fileId =
            MockSfiMessagesRestEndpoint.getCapturedFiles().entries.let {
                assertEquals(1, it.size)
                assertEquals(message.documentDisplayName, it.first().value.name)
                assertContentEquals(fileContent, it.first().value.content)
                it.first().key
            }
        MockSfiMessagesRestEndpoint.getCapturedMessages().entries.let {
            assertEquals(1, it.size)
            assertEquals(message.messageId, it.first().key)
            val (_, captured) = it.first().value
            assertEquals(
                NewMessageFromClientOrganisation(
                    externalId = message.messageId,
                    electronic =
                        NewElectronicMessage(
                            title = message.messageHeader,
                            body = message.messageContent,
                            files = listOf(FileReference(fileId)),
                        ),
                    paperMail =
                        NewNormalPaperMail(
                            createCoverPage = true,
                            files = listOf(FileReference(fileId)),
                            printingAndEnvelopingService =
                                PrintingAndEnvelopingService(
                                    PostiMessaging(
                                        contactDetails =
                                            ContactDetails(sfiEnv.contactPerson.email!!),
                                        username = sfiEnv.printing.billingId,
                                        password = sfiEnv.printing.billingPassword!!.value,
                                    )
                                ),
                            recipient =
                                NewPaperMailRecipient(
                                    Address(
                                        name = "${message.lastName} ${message.firstName}",
                                        streetAddress = message.streetAddress,
                                        zipCode = message.postalCode,
                                        city = message.postOffice,
                                    )
                                ),
                            sender =
                                NewPaperMailSender(
                                    Address(
                                        name = sfiEnv.contactOrganization.name!!,
                                        streetAddress = sfiEnv.contactOrganization.streetAddress!!,
                                        zipCode = sfiEnv.contactOrganization.postalCode!!,
                                        city = sfiEnv.contactOrganization.postOffice!!,
                                    )
                                ),
                        ),
                    recipient = Recipient(id = message.ssn),
                    sender = Sender(serviceId = sfiEnv.serviceIdentifier),
                ),
                captured,
            )
        }
    }

    @Test
    fun `it handles duplicate message status 409 correctly`() {
        client.send(message)
        assertEquals(1, MockSfiMessagesRestEndpoint.getCapturedMessages().size)
        client.send(message)
        assertEquals(1, MockSfiMessagesRestEndpoint.getCapturedMessages().size)
    }

    @Test
    fun `it handles access token expiry gracefully`() {
        client.send(message)
        assertEquals(1, MockSfiMessagesRestEndpoint.getCapturedMessages().size)
        MockSfiMessagesRestEndpoint.clearTokens()
        client.send(message.copy(messageId = "message-id-2"))
        assertEquals(2, MockSfiMessagesRestEndpoint.getCapturedMessages().size)
    }

    @Test
    fun `changing password works`() {
        val oldPassword = MockSfiMessagesRestEndpoint.getCurrentPassword()
        client.rotatePassword()
        val newPassword = MockSfiMessagesRestEndpoint.getCurrentPassword()
        assertNotEquals(oldPassword, newPassword)

        // sending a message should still work after password change
        client.send(message)
        assertEquals(1, MockSfiMessagesRestEndpoint.getCapturedMessages().size)
    }

    @Test
    fun `password change handles access token expiry gracefully`() {
        client.send(message)
        assertEquals(1, MockSfiMessagesRestEndpoint.getCapturedMessages().size)
        MockSfiMessagesRestEndpoint.clearTokens()
        val oldPassword = MockSfiMessagesRestEndpoint.getCurrentPassword()
        client.rotatePassword()
        val newPassword = MockSfiMessagesRestEndpoint.getCurrentPassword()
        assertNotEquals(oldPassword, newPassword)

        // sending a message should still work after password change
        client.send(message)
        assertEquals(1, MockSfiMessagesRestEndpoint.getCapturedMessages().size)
    }
}
