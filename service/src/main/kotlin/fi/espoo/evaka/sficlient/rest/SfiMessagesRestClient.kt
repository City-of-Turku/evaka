// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.sficlient.rest

import com.fasterxml.jackson.module.kotlin.readValue
import fi.espoo.evaka.Sensitive
import fi.espoo.evaka.SfiEnv
import fi.espoo.evaka.s3.Document
import fi.espoo.evaka.s3.DocumentLocation
import fi.espoo.evaka.sficlient.SfiMessage
import fi.espoo.evaka.sficlient.SfiMessagesClient
import fi.espoo.evaka.shared.config.defaultJsonMapperBuilder
import fi.espoo.voltti.logging.loggers.info
import io.github.oshai.kotlinlogging.KotlinLogging
import java.time.Duration
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

class Config(env: SfiEnv) {
    val urls =
        ApiUrls(
            requireNotNull(env.restAddress?.toHttpUrlOrNull()) {
                "SFI REST address must be set (was ${env.restAddress})"
            }
        )
    private val printingAndEnvelopingService =
        PrintingAndEnvelopingService(
            PostiMessaging(
                contactDetails =
                    ContactDetails(
                        email =
                            requireNotNull(env.contactPerson.email) {
                                "SFI contact person email must be set"
                            }
                    ),
                username = env.printing.billingId,
                password =
                    requireNotNull(env.printing.billingPassword?.value) {
                        "SFI printing billing password must be set"
                    },
            )
        )

    private val sender = Sender(serviceId = env.serviceIdentifier)
    private val paperMailSender =
        NewPaperMailSender(
            Address(
                name =
                    requireNotNull(env.contactOrganization.name) {
                        "SFI contact organization name must be set"
                    },
                streetAddress =
                    requireNotNull(env.contactOrganization.streetAddress) {
                        "SFI contact organization street address must be set"
                    },
                zipCode =
                    requireNotNull(env.contactOrganization.postalCode) {
                        "SFI contact organization postal code must be set"
                    },
                city =
                    requireNotNull(env.contactOrganization.postOffice) {
                        "SFI contact organization post office must be set"
                    },
            )
        )
    val restUsername = requireNotNull(env.restUsername) { "SFI REST username must be set" }

    fun messageRequestBody(msg: SfiMessage, attachment: AttachmentReference) =
        MultichannelMessageRequestBody(
            msg.messageId,
            ElectronicPart(
                attachments = listOf(attachment),
                body = msg.messageContent,
                bodyFormat = BodyFormat.TEXT,
                messageServiceType = MessageServiceType.NORMAL,
                notifications =
                    MessageNotifications(
                        senderDetailsInNotifications =
                            SenderDetailsInNotifications.ORGANIZATION_AND_SERVICE_NAME,
                        unreadMessageNotification =
                            UnreadMessageNotification(reminder = Reminder.DEFAULT_REMINDER),
                    ),
                replyAllowedBy = ReplyAllowedBy.NO_ONE,
                title = msg.messageHeader,
                visibility = Visibility.RECIPIENT_ONLY,
            ),
            PaperMailPart(
                attachments = listOf(attachment),
                colorPrinting = true,
                createAddressPage = true,
                messageServiceType = MessageServiceType.NORMAL,
                printingAndEnvelopingService,
                NewPaperMailRecipient(
                    Address(
                        name = "${msg.lastName} ${msg.firstName}",
                        streetAddress = msg.streetAddress,
                        zipCode = msg.postalCode,
                        city = msg.postOffice,
                        countryCode = msg.countryCode,
                    )
                ),
                rotateLandscapePages = false,
                sender = paperMailSender,
                twoSidedPrinting = true,
            ),
            Recipient(id = msg.ssn),
            sender,
        )
}

class SfiMessagesRestClient(
    env: SfiEnv,
    private val getDocument: (location: DocumentLocation) -> Document,
    private val passwordStore: PasswordStore,
) : SfiMessagesClient {
    private val config = Config(env)
    private val jsonMapper = defaultJsonMapperBuilder().build()
    private val httpClient: OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(Duration.ofMinutes(1))
            .readTimeout(Duration.ofMinutes(1))
            .writeTimeout(Duration.ofMinutes(1))
            // This authenticator gets automatically triggered on 401 Unauthorized responses
            .authenticator { _, response ->
                val usedAuthorization = response.request.header("Authorization")
                val isFirstAttempt = response.priorResponse == null
                if (usedAuthorization != null && isFirstAttempt) {
                    authorizationHeader.expire(Sensitive(usedAuthorization))
                    response.request
                        .newBuilder()
                        .header("Authorization", authorizationHeader.get().value)
                        .build()
                } else null
            }
            .build()

    private val authorizationHeader = InMemoryStore {
        Sensitive("Bearer ${getAccessToken(cachedPassword.get())}")
    }
    private val cachedPassword = InMemoryStore {
        passwordStore.getPassword(PasswordStore.Label.CURRENT)?.password
            ?: error("Current password not found")
    }

    private val logger = KotlinLogging.logger {}

    private val jsonMediaType = "application/json".toMediaType()

    private fun jsonRequestBody(value: Any) =
        jsonMapper.writeValueAsString(value).toRequestBody(jsonMediaType)

    private inline fun <reified T : Any> jsonResponseBody(response: Response) =
        response.body?.let { body ->
            if (body.contentType() == null || body.contentType() == jsonMediaType)
                jsonMapper.readValue<T>(body.charStream())
            else
                error(
                    "Expected JSON response body ${T::class}, got ${body.contentType()} with length ${body.contentLength()} (${body.string()})"
                )
        } ?: error("Expected JSON response body ${T::class}, got nothing")

    private fun getAccessToken(password: Sensitive<String>): String {
        logger.info { "Requesting a new access token" }

        httpClient
            .newCall(
                Request.Builder()
                    .url(config.urls.token)
                    .header("Accept", "application/json")
                    .post(
                        jsonRequestBody(
                            AccessTokenRequestBody(
                                username = config.restUsername,
                                password = password.value,
                            )
                        )
                    )
                    .build()
            )
            .execute()
            .use { response ->
                if (response.isSuccessful) {
                    val body = jsonResponseBody<AccessTokenResponse>(response)
                    return body.access_token
                } else {
                    if (response.code == 400) {
                        cachedPassword.expire(password)
                    }
                    val body = jsonResponseBody<ApiError>(response)
                    error(
                        "Access token request failed with HTTP ${response.code} ${response.message}: $body"
                    )
                }
            }
    }

    private fun uploadFile(fileName: String, pdfBytes: ByteArray): AttachmentReference {
        logger.info { "Uploading file $fileName (${pdfBytes.size} bytes)" }

        httpClient
            .newCall(
                Request.Builder()
                    .url(config.urls.attachments)
                    .header("Authorization", authorizationHeader.get().value)
                    .header("Accept", "application/json")
                    .post(pdfUploadBody(fileName, pdfBytes))
                    .build()
            )
            .execute()
            .use { response ->
                if (response.isSuccessful) {
                    return jsonResponseBody<AttachmentReference>(response)
                } else {
                    val body = jsonResponseBody<ApiError>(response)
                    error(
                        "File upload request failed with HTTP ${response.code} ${response.message}: $body"
                    )
                }
            }
    }

    override fun send(msg: SfiMessage) {
        val pdfBytes = getDocument(DocumentLocation(msg.documentBucket, msg.documentKey)).bytes

        logger.info(
            mapOf("meta" to mapOf("documentId" to msg.documentId, "messageId" to msg.messageId))
        ) {
            "Sending SFI message about ${msg.documentId} with messageId: ${msg.messageId}"
        }

        val attachmentReference = uploadFile(msg.documentDisplayName, pdfBytes)

        httpClient
            .newCall(
                Request.Builder()
                    .url(config.urls.messages)
                    .header("Authorization", authorizationHeader.get().value)
                    .header("Accept", "application/json")
                    .post(jsonRequestBody(config.messageRequestBody(msg, attachmentReference)))
                    .build()
            )
            .execute()
            .use { response ->
                if (response.isSuccessful) {
                    val body = jsonResponseBody<MessageResponse>(response)
                    logger.info {
                        "SFI message delivery succeeded with messageId: ${body.messageId}"
                    }
                    body.messageId
                } else if (response.code == 409) {
                    logger.info {
                        "SFI message delivery failed with HTTP ${response.code} ${response.message}. Skipping duplicate message"
                    }
                } else {
                    val body = jsonResponseBody<ApiError>(response)
                    error(
                        "Message request failed with HTTP ${response.code} ${response.message}: $body"
                    )
                }
            }
    }

    override fun rotatePassword() {
        logger.info { "Rotating password" }
        val pending = passwordStore.getPassword(PasswordStore.Label.PENDING)
        val current =
            passwordStore.getPassword(PasswordStore.Label.CURRENT)
                ?: error("Current password not found")
        val newPassword =
            if (pending == null || pending == current) {
                // A new pending password is needed
                val password = generatePassword()
                val version = passwordStore.putPassword(password)
                passwordStore.moveLabel(version, PasswordStore.Label.PENDING)
                PasswordStore.VersionedPassword(password, version)
            } else {
                logger.info { "Pending password found -> testing if it's valid" }
                val gotAccessToken =
                    try {
                        getAccessToken(pending.password)
                        true
                    } catch (e: Exception) {
                        logger.error(e) { "Failed to get access token with pending password" }
                        false
                    }
                if (gotAccessToken) {
                    // The pending password is already in use and should be current
                    passwordStore.moveLabel(pending.version, PasswordStore.Label.CURRENT)
                    cachedPassword.expire(current.password)
                    return
                } else {
                    // The pending password is not yet in use but can be reused
                    pending
                }
            }

        val accessToken = getAccessToken(current.password)
        httpClient
            .newCall(
                Request.Builder()
                    .url(config.urls.changePassword)
                    .header("Accept", "application/json")
                    .post(
                        jsonRequestBody(
                            ChangePasswordRequestBody(
                                accessToken = accessToken,
                                currentPassword = current.password.value,
                                newPassword = newPassword.password.value,
                            )
                        )
                    )
                    .build()
            )
            .execute()
            .use { response ->
                if (!response.isSuccessful) {
                    val body = jsonResponseBody<ApiError>(response)
                    error(
                        "Password change request failed with HTTP ${response.code} ${response.message}: $body"
                    )
                }
            }

        passwordStore.moveLabel(newPassword.version, PasswordStore.Label.CURRENT)
        // Expiring the cache guarantees this instance will re-fetch the password from the store.
        // Other service containers will re-fetch the password once they get an authentication
        // failure when attempting to acquire a new access token.
        cachedPassword.expire(current.password)
    }

    override fun getEvents(continuationToken: String?): GetEventsResponse {
        logger.info {
            "Requesting suomi.fi events" +
                if (!continuationToken.isNullOrEmpty()) " with continuationToken $continuationToken"
                else ""
        }

        val url =
            config.urls.events
                .newBuilder()
                .apply {
                    if (!continuationToken.isNullOrBlank()) {
                        addQueryParameter("continuationToken", continuationToken)
                    }
                }
                .build()

        httpClient
            .newCall(
                Request.Builder()
                    .url(url)
                    .header("Authorization", authorizationHeader.get().value)
                    .header("Accept", "application/json")
                    .get()
                    .build()
            )
            .execute()
            .use { response ->
                if (response.isSuccessful) {
                    return jsonResponseBody<GetEventsResponse>(response)
                } else {
                    val body = jsonResponseBody<ApiError>(response)
                    error(
                        "Message request failed with HTTP ${response.code} ${response.message}: $body"
                    )
                }
            }
    }

    private fun generatePassword(): Sensitive<String> =
        Sensitive(
            (
                // one of each type is required in the final password
                sequenceOf(
                    PASSWORD_NUMBERS.random(),
                    PASSWORD_LOWERCASE.random(),
                    PASSWORD_UPPERCASE.random(),
                    PASSWORD_SYMBOL.random(),
                ) +
                    // fill the rest with anything
                    generateSequence { PASSWORD_ANY.random() })
                .take(PASSWORD_LENGTH)
                .shuffled()
                .joinToString("")
        )

    companion object {
        const val PASSWORD_LENGTH = 32
        val PASSWORD_NUMBERS = ('0'..'9')
        val PASSWORD_LOWERCASE = ('a'..'z')
        val PASSWORD_UPPERCASE = ('A'..'Z')
        val PASSWORD_SYMBOL = listOf('$', '#', '~', '!')
        val PASSWORD_ANY =
            PASSWORD_NUMBERS + PASSWORD_LOWERCASE + PASSWORD_UPPERCASE + PASSWORD_SYMBOL
    }
}
