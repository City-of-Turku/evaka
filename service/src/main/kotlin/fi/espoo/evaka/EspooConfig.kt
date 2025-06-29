// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka

import com.fasterxml.jackson.databind.json.JsonMapper
import fi.espoo.evaka.emailclient.EvakaEmailMessageProvider
import fi.espoo.evaka.emailclient.IEmailMessageProvider
import fi.espoo.evaka.espoo.*
import fi.espoo.evaka.espoo.bi.EspooBiClient
import fi.espoo.evaka.espoo.bi.EspooBiHttpClient
import fi.espoo.evaka.espoo.bi.EspooBiJob
import fi.espoo.evaka.espoo.bi.MockEspooBiClient
import fi.espoo.evaka.espoo.invoicing.EspooIncomeCoefficientMultiplierProvider
import fi.espoo.evaka.holidayperiod.QuestionnaireType
import fi.espoo.evaka.invoicing.domain.PaymentIntegrationClient
import fi.espoo.evaka.invoicing.integration.EspooInvoiceIntegrationClient
import fi.espoo.evaka.invoicing.integration.InvoiceIntegrationClient
import fi.espoo.evaka.invoicing.service.DefaultInvoiceGenerationLogic
import fi.espoo.evaka.invoicing.service.DefaultInvoiceNumberProvider
import fi.espoo.evaka.invoicing.service.EspooIncomeTypesProvider
import fi.espoo.evaka.invoicing.service.EspooInvoiceProducts
import fi.espoo.evaka.invoicing.service.IncomeCoefficientMultiplierProvider
import fi.espoo.evaka.invoicing.service.IncomeTypesProvider
import fi.espoo.evaka.invoicing.service.InvoiceNumberProvider
import fi.espoo.evaka.invoicing.service.InvoiceProductProvider
import fi.espoo.evaka.logging.defaultAccessLoggingValve
import fi.espoo.evaka.mealintegration.DefaultMealTypeMapper
import fi.espoo.evaka.mealintegration.MealTypeMapper
import fi.espoo.evaka.reports.patu.EspooPatuIntegrationClient
import fi.espoo.evaka.reports.patu.PatuAsyncJobProcessor
import fi.espoo.evaka.reports.patu.PatuIntegrationClient
import fi.espoo.evaka.reports.patu.PatuReportingService
import fi.espoo.evaka.shared.ArchiveProcessConfig
import fi.espoo.evaka.shared.ArchiveProcessType
import fi.espoo.evaka.shared.FeatureConfig
import fi.espoo.evaka.shared.async.AsyncJob
import fi.espoo.evaka.shared.async.AsyncJobRunner
import fi.espoo.evaka.shared.auth.PasswordConstraints
import fi.espoo.evaka.shared.auth.PasswordSpecification
import fi.espoo.evaka.shared.db.DevDataInitializer
import fi.espoo.evaka.shared.message.EvakaMessageProvider
import fi.espoo.evaka.shared.message.IMessageProvider
import fi.espoo.evaka.shared.security.actionrule.ActionRuleMapping
import fi.espoo.evaka.shared.template.EvakaTemplateProvider
import fi.espoo.evaka.shared.template.ITemplateProvider
import fi.espoo.evaka.titania.TitaniaEmployeeIdConverter
import io.opentelemetry.api.trace.Tracer
import java.net.URI
import org.jdbi.v3.core.Jdbi
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory
import org.springframework.boot.web.server.WebServerFactoryCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Lazy
import org.springframework.context.annotation.Profile
import org.springframework.core.env.Environment

@Configuration
@Profile("espoo_evaka")
@Import(EspooAsyncJobRegistration::class)
class EspooConfig {
    @Bean fun espooEnv(env: Environment) = EspooEnv.fromEnvironment(env)

    @Bean
    fun invoiceIntegrationClient(
        env: EspooEnv,
        invoiceEnv: ObjectProvider<EspooInvoiceIntegrationEnv>,
        jsonMapper: JsonMapper,
    ): InvoiceIntegrationClient =
        when (env.invoiceIntegrationEnabled) {
            true -> EspooInvoiceIntegrationClient(invoiceEnv.getObject(), jsonMapper)
            false -> InvoiceIntegrationClient.MockClient(jsonMapper)
        }

    @Bean
    fun patuIntegrationClient(
        env: EspooEnv,
        patuEnv: ObjectProvider<EspooPatuIntegrationEnv>,
        jsonMapper: JsonMapper,
    ): PatuIntegrationClient =
        when (env.patuIntegrationEnabled) {
            true -> EspooPatuIntegrationClient(patuEnv.getObject(), jsonMapper)
            false -> PatuIntegrationClient.MockPatuClient(jsonMapper)
        }

    @Bean
    fun patuReportingService(client: PatuIntegrationClient): PatuReportingService =
        PatuReportingService(client)

    @Bean
    @Lazy
    fun espooInvoiceIntegrationEnv(env: Environment) =
        EspooInvoiceIntegrationEnv.fromEnvironment(env)

    @Bean fun espooInvoiceGenerationLogicChooser() = DefaultInvoiceGenerationLogic

    @Bean
    @Lazy
    fun espooPatuIntegrationEnv(env: Environment) = EspooPatuIntegrationEnv.fromEnvironment(env)

    @Bean
    fun espooPatuAsyncJobProcessor(
        asyncJobRunner: AsyncJobRunner<AsyncJob>,
        patuReportingService: PatuReportingService,
    ) = PatuAsyncJobProcessor(asyncJobRunner, patuReportingService)

    @Bean
    @Profile("local")
    fun paymentIntegrationMockClient(jsonMapper: JsonMapper): PaymentIntegrationClient =
        PaymentIntegrationClient.MockClient(jsonMapper)

    @Bean
    @Profile("production")
    fun paymentIntegrationClient(): PaymentIntegrationClient =
        PaymentIntegrationClient.FailingClient()

    @Bean fun messageProvider(): IMessageProvider = EvakaMessageProvider()

    @Bean
    fun emailMessageProvider(env: EvakaEnv): IEmailMessageProvider = EvakaEmailMessageProvider(env)

    @Bean fun templateProvider(): ITemplateProvider = EvakaTemplateProvider()

    @Bean
    fun espooScheduledJobEnv(env: Environment): ScheduledJobsEnv<EspooScheduledJob> =
        ScheduledJobsEnv.fromEnvironment(
            EspooScheduledJob.entries.associateWith { it.defaultSettings },
            "espoo.job",
            env,
        )

    @Bean
    @Profile("local")
    fun devDataInitializer(jdbi: Jdbi, tracer: Tracer) = DevDataInitializer(jdbi, tracer)

    @Bean fun incomeTypesProvider(): IncomeTypesProvider = EspooIncomeTypesProvider()

    @Bean
    fun coefficientMultiplierProvider(): IncomeCoefficientMultiplierProvider =
        EspooIncomeCoefficientMultiplierProvider()

    @Bean fun invoiceProductsProvider(): InvoiceProductProvider = EspooInvoiceProducts.Provider()

    @Bean
    fun invoiceNumberProvider(): InvoiceNumberProvider = DefaultInvoiceNumberProvider(5000000000)

    @Bean
    fun titaniaEmployeeIdConverter(): TitaniaEmployeeIdConverter =
        object : TitaniaEmployeeIdConverter {
            override fun fromTitania(employeeId: String): String = employeeId.trimStart('0')
        }

    @Bean
    fun espooAsyncJobRunner(
        jdbi: Jdbi,
        tracer: Tracer,
        env: Environment,
    ): AsyncJobRunner<EspooAsyncJob> =
        AsyncJobRunner(EspooAsyncJob::class, listOf(EspooAsyncJob.pool), jdbi, tracer)

    @Bean @Lazy fun espooBiEnv(env: Environment) = EspooBiEnv.fromEnvironment(env)

    @Bean fun espooBiJob(client: EspooBiClient) = EspooBiJob(client)

    @Bean
    fun espooBiClient(env: EspooEnv, biEnv: ObjectProvider<EspooBiEnv>) =
        when (env.biIntegrationEnabled) {
            true -> EspooBiHttpClient(biEnv.getObject())
            false -> MockEspooBiClient()
        }

    @Bean
    fun linkityEnv(espooEnv: EspooEnv, env: Environment): LinkityEnv? =
        when (espooEnv.linkityEnabled) {
            true -> LinkityEnv.fromEnvironment(env)
            false -> null
        }

    @Bean
    fun featureConfig(): FeatureConfig =
        FeatureConfig(
            valueDecisionCapacityFactorEnabled = false,
            citizenReservationThresholdHours = 150,
            dailyFeeDivisorOperationalDaysOverride = null,
            freeSickLeaveOnContractDays = false, // Doesn't affect Espoo
            freeAbsenceGivesADailyRefund = true,
            alwaysUseDaycareFinanceDecisionHandler = false, // Doesn't affect Espoo
            paymentNumberSeriesStart = 1, // Payments are not yet in use in Espoo
            unplannedAbsencesAreContractSurplusDays = false, // Doesn't affect Espoo
            maxContractDaySurplusThreshold = null, // Doesn't affect Espoo
            useContractDaysAsDailyFeeDivisor = true, // Doesn't affect Espoo
            assistanceDecisionMakerRoles = null,
            preschoolAssistanceDecisionMakerRoles = null,
            requestedStartUpperLimit = 14,
            postOffice = "ESPOO",
            municipalMessageAccountName = "Espoon kaupunki - Esbo stad - City of Espoo",
            serviceWorkerMessageAccountName =
                "Varhaiskasvatuksen palveluohjaus - Småbarnspedagogikens servicehandledning - Early childhood education service guidance",
            financeMessageAccountName =
                "Varhaiskasvatuksen asiakasmaksut - Småbarnspedagogikens avgifter - Early childhood education fees",
            applyPlacementUnitFromDecision = false,
            preferredStartRelativeApplicationDueDate = false,
            fiveYearsOldDaycareEnabled = true,
            freeJulyStartOnSeptember = true,
            archiveMetadataOrganization = "Espoon kaupungin esiopetus ja varhaiskasvatus",
            archiveMetadataConfigs = { type: ArchiveProcessType, year: Int ->
                when (type) {
                    ArchiveProcessType.APPLICATION_DAYCARE ->
                        ArchiveProcessConfig(
                            processDefinitionNumber = "12.06.01",
                            archiveDurationMonths = 10 * 12,
                        )
                    ArchiveProcessType.APPLICATION_PRESCHOOL ->
                        ArchiveProcessConfig(
                            processDefinitionNumber = if (year >= 2026) "12.06.02" else "12.06.01",
                            archiveDurationMonths = 10 * 12,
                        )
                    ArchiveProcessType.APPLICATION_CLUB ->
                        ArchiveProcessConfig(
                            processDefinitionNumber = "12.06.01",
                            archiveDurationMonths = 10 * 12,
                        )
                    ArchiveProcessType.ASSISTANCE_NEED_DECISION_DAYCARE ->
                        ArchiveProcessConfig(
                            processDefinitionNumber = "12.06.03",
                            archiveDurationMonths = 120 * 12,
                        )
                    ArchiveProcessType.ASSISTANCE_NEED_DECISION_PRESCHOOL ->
                        ArchiveProcessConfig(
                            processDefinitionNumber = "12.06.04",
                            archiveDurationMonths = 120 * 12,
                        )
                    ArchiveProcessType.FEE_DECISION ->
                        ArchiveProcessConfig(
                            processDefinitionNumber = if (year >= 2026) "02.09.01" else "12.06.07",
                            archiveDurationMonths = 10 * 12,
                        )
                    ArchiveProcessType.VOUCHER_VALUE_DECISION ->
                        ArchiveProcessConfig(
                            processDefinitionNumber = if (year >= 2026) "02.09.01" else "12.06.08",
                            archiveDurationMonths = 10 * 12,
                        )
                }
            },
            holidayQuestionnaireType = QuestionnaireType.FIXED_PERIOD,
        )

    @Bean
    fun tomcatCustomizer(env: Environment) =
        WebServerFactoryCustomizer<TomcatServletWebServerFactory> {
            it.addContextValves(defaultAccessLoggingValve(env))
            it.setDisableMBeanRegistry(false)
        }

    @Bean fun actionRuleMapping(): ActionRuleMapping = EspooActionRuleMapping()

    @Bean
    fun espooScheduledJobs(
        patuReportingService: PatuReportingService,
        espooAsyncJobRunner: AsyncJobRunner<EspooAsyncJob>,
        env: ScheduledJobsEnv<EspooScheduledJob>,
        linkityEnv: LinkityEnv?,
        jsonMapper: JsonMapper,
    ): EspooScheduledJobs =
        EspooScheduledJobs(patuReportingService, espooAsyncJobRunner, env, linkityEnv, jsonMapper)

    @Bean fun espooMealTypeMapper(): MealTypeMapper = DefaultMealTypeMapper

    @Bean
    fun espooPasswordSpecification(): PasswordSpecification =
        DefaultPasswordSpecification(
            PasswordConstraints.UNCONSTRAINED.copy(
                minLength = 15,
                minLowers = 1,
                minUppers = 1,
                minDigits = 1,
                minSymbols = 1,
            )
        )
}

data class EspooEnv(
    val invoiceIntegrationEnabled: Boolean,
    val patuIntegrationEnabled: Boolean,
    val biIntegrationEnabled: Boolean,
    val linkityEnabled: Boolean,
) {
    companion object {
        fun fromEnvironment(env: Environment): EspooEnv =
            EspooEnv(
                invoiceIntegrationEnabled =
                    env.lookup(
                        "espoo.integration.invoice.enabled",
                        "fi.espoo.integration.invoice.enabled",
                    ) ?: true,
                patuIntegrationEnabled = env.lookup("espoo.integration.patu.enabled") ?: false,
                biIntegrationEnabled = env.lookup("espoo.integration.bi.enabled") ?: false,
                linkityEnabled = env.lookup("espoo.integration.linkity.enabled") ?: false,
            )
    }
}

data class EspooInvoiceIntegrationEnv(
    val url: String,
    val username: String,
    val password: Sensitive<String>,
    val sendCodebtor: Boolean,
) {
    companion object {
        fun fromEnvironment(env: Environment) =
            EspooInvoiceIntegrationEnv(
                url =
                    env.lookup("espoo.integration.invoice.url", "fi.espoo.integration.invoice.url"),
                username =
                    env.lookup(
                        "espoo.integration.invoice.username",
                        "fi.espoo.integration.invoice.username",
                    ),
                password =
                    Sensitive(
                        env.lookup(
                            "espoo.integration.invoice.password",
                            "fi.espoo.integration.invoice.password",
                        )
                    ),
                sendCodebtor = env.lookup("espoo.integration.invoice.send_codebtor") ?: false,
            )
    }
}

data class EspooBiEnv(val url: String, val username: String, val password: Sensitive<String>) {
    companion object {
        fun fromEnvironment(env: Environment) =
            EspooBiEnv(
                url = env.lookup("espoo.integration.bi.url"),
                username = env.lookup("espoo.integration.bi.username"),
                password = Sensitive(env.lookup("espoo.integration.bi.password")),
            )
    }
}

data class EspooPatuIntegrationEnv(
    val url: String,
    val username: String,
    val password: Sensitive<String>,
) {
    companion object {
        fun fromEnvironment(env: Environment) =
            EspooPatuIntegrationEnv(
                url = env.lookup("fi.espoo.integration.patu.url"),
                username = env.lookup("fi.espoo.integration.patu.username"),
                password = Sensitive(env.lookup("fi.espoo.integration.patu.password")),
            )
    }
}

data class LinkityEnv(val url: URI, val apikey: Sensitive<String>) {
    companion object {
        fun fromEnvironment(env: Environment) =
            LinkityEnv(
                url = URI.create(env.lookup("espoo.integration.linkity.url")),
                apikey = Sensitive(env.lookup("espoo.integration.linkity.apikey")),
            )
    }
}
