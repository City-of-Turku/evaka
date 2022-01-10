// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.dvv

import com.github.kittinunf.fuel.core.FuelManager
import fi.espoo.evaka.DvvModificationsEnv
import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.identity.ExternalIdentifier
import fi.espoo.evaka.pis.service.FridgeFamilyService
import fi.espoo.evaka.pis.service.ParentshipService
import fi.espoo.evaka.pis.service.PersonDTO
import fi.espoo.evaka.pis.service.PersonService
import fi.espoo.evaka.pis.service.PersonWithChildrenDTO
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.async.AsyncJob
import fi.espoo.evaka.shared.async.AsyncJobRunner
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.vtjclient.service.persondetails.IPersonDetailsService
import org.junit.jupiter.api.BeforeEach
import org.mockito.kotlin.mock
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Service
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class DvvModificationsServiceIntegrationTestBase : FullApplicationTest() {

    @Autowired
    protected lateinit var personService: DvvIntegrationTestPersonService

    @Autowired
    protected lateinit var parentshipService: ParentshipService

    @Autowired
    protected lateinit var asyncJobRunner: AsyncJobRunner<AsyncJob>

    protected lateinit var fridgeFamilyService: FridgeFamilyService
    protected lateinit var dvvModificationsServiceClient: DvvModificationsServiceClient
    protected lateinit var dvvModificationsService: DvvModificationsService
    protected lateinit var requestCustomizerMock: DvvModificationRequestCustomizer

    @BeforeEach
    protected fun initDvvModificationService() {
        assert(httpPort > 0)

        fridgeFamilyService = FridgeFamilyService(personService, parentshipService)
        val mockDvvBaseUrl = "http://localhost:$httpPort/mock-integration/dvv/api/v1"
        requestCustomizerMock = mock()
        dvvModificationsServiceClient = DvvModificationsServiceClient(objectMapper, noCertCheckFuelManager(), listOf(requestCustomizerMock), DvvModificationsEnv.fromEnvironment(env).copy(url = mockDvvBaseUrl))
        dvvModificationsService = DvvModificationsService(dvvModificationsServiceClient, personService, fridgeFamilyService, asyncJobRunner)
    }

    fun noCertCheckFuelManager() = FuelManager().apply {
        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate>? = null
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
        })

        socketFactory = SSLContext.getInstance("SSL").apply {
            init(null, trustAllCerts, java.security.SecureRandom())
        }.socketFactory

        hostnameVerifier = HostnameVerifier { _, _ -> true }
    }
}

@Service
class DvvIntegrationTestPersonService(personDetailsService: IPersonDetailsService) : PersonService(personDetailsService) {
    companion object {
        private val ssnUpdateCounts = mutableMapOf<String, Int>()
        private val ssnCustodianUpdateCounts = mutableMapOf<String, Int>()

        fun resetSsnUpdateCounts() {
            ssnUpdateCounts.clear()
            ssnCustodianUpdateCounts.clear()
        }

        fun recordSsnUpdate(ssn: ExternalIdentifier.SSN) {
            ssnUpdateCounts.put(ssn.toString(), ssnUpdateCounts.getOrDefault(ssn.toString(), 0) + 1)
        }

        fun recordSsnCustodianUpdate(ssn: ExternalIdentifier.SSN) {
            ssnCustodianUpdateCounts.put(ssn.toString(), ssnCustodianUpdateCounts.getOrDefault(toString(), 0) + 1)
        }

        fun getSsnUpdateCount(ssn: ExternalIdentifier.SSN): Int {
            return ssnUpdateCounts.getOrDefault(ssn.toString(), 0)
        }

        fun getSsnUpdateCount(ssn: String): Int {
            return ssnUpdateCounts.getOrDefault(ssn, 0)
        }

        fun getSsnCustodianUpdateCount(ssn: ExternalIdentifier.SSN): Int {
            return ssnCustodianUpdateCounts.getOrDefault(ssn.toString(), 0)
        }

        fun getSsnCustodianUpdateCount(ssn: String): Int {
            return ssnCustodianUpdateCounts.getOrDefault(ssn, 0)
        }
    }

    override fun getOrCreatePerson(tx: Database.Transaction, user: AuthenticatedUser, ssn: ExternalIdentifier.SSN, readonly: Boolean): PersonDTO? {
        recordSsnUpdate(ssn)
        return super.getOrCreatePerson(tx, user, ssn, readonly)
    }

    override fun getPersonWithChildren(
        tx: Database.Transaction,
        user: AuthenticatedUser,
        id: PersonId,
        forceRefresh: Boolean
    ): PersonWithChildrenDTO? {
        return super.getPersonWithChildren(tx, user, id, forceRefresh)?.let {
            val ssn = it.socialSecurityNumber
            if (ssn != null)
                recordSsnCustodianUpdate(ExternalIdentifier.SSN.getInstance(ssn))
            it
        }
    }
}
