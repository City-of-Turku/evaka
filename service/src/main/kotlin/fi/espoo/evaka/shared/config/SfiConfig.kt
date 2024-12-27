// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.shared.config

import fi.espoo.evaka.SfiEnv
import fi.espoo.evaka.s3.DocumentService
import fi.espoo.evaka.sficlient.MockSfiMessagesClient
import fi.espoo.evaka.sficlient.SfiMessagesClient
import fi.espoo.evaka.sficlient.SfiMessagesSoapClient
import fi.espoo.evaka.sficlient.rest.AwsSsmPasswordStore
import fi.espoo.evaka.sficlient.rest.SfiMessagesRestClient
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.services.ssm.SsmClient

@Configuration
class SfiConfig {
    private val logger = KotlinLogging.logger {}

    @Bean
    fun sfiMessagesClient(
        env: ObjectProvider<SfiEnv>,
        ssmClient: ObjectProvider<SsmClient>,
        documentClient: DocumentService,
    ): SfiMessagesClient =
        env.ifAvailable?.let {
            if (it.restEnabled) {
                logger.info { "Using real REST Suomi.fi Messages API client. Configuration: $it" }
                SfiMessagesRestClient(
                    it,
                    documentClient::get,
                    AwsSsmPasswordStore(ssmClient.getObject(), it),
                )
            } else {
                logger.info { "Using real SOAP Suomi.fi Messages API client. Configuration: $it" }
                SfiMessagesSoapClient(it, documentClient::get)
            }
        }
            ?: MockSfiMessagesClient().also {
                logger.info { "Using mock Suomi.fi Messages API client" }
            }
}
