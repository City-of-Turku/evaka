// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.assistanceneed.decision

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.emailclient.MockEmail
import fi.espoo.evaka.emailclient.MockEmailClient
import fi.espoo.evaka.insertGeneralTestFixtures
import fi.espoo.evaka.pis.Employee
import fi.espoo.evaka.pis.service.insertGuardian
import fi.espoo.evaka.sficlient.MockSfiMessagesClient
import fi.espoo.evaka.shared.AssistanceNeedDecisionId
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.EmployeeId
import fi.espoo.evaka.shared.async.AsyncJob
import fi.espoo.evaka.shared.async.AsyncJobRunner
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.dev.DevEmployee
import fi.espoo.evaka.shared.dev.DevPerson
import fi.espoo.evaka.shared.dev.insertTestEmployee
import fi.espoo.evaka.shared.domain.BadRequest
import fi.espoo.evaka.shared.domain.DateRange
import fi.espoo.evaka.shared.domain.Forbidden
import fi.espoo.evaka.shared.domain.NotFound
import fi.espoo.evaka.shared.domain.RealEvakaClock
import fi.espoo.evaka.testAdult_1
import fi.espoo.evaka.testAdult_4
import fi.espoo.evaka.testChild_1
import fi.espoo.evaka.testDaycare
import fi.espoo.evaka.testDecisionMaker_1
import fi.espoo.evaka.testDecisionMaker_2
import fi.espoo.evaka.testDecisionMaker_3
import fi.espoo.evaka.unitSupervisorOfTestDaycare
import java.io.File
import java.io.FileOutputStream
import java.time.LocalDate
import java.util.UUID
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import mu.KotlinLogging
import org.assertj.core.groups.Tuple
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired

private val logger = KotlinLogging.logger {}

class AssistanceNeedDecisionIntegrationTest : FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired
    private lateinit var assistanceNeedDecisionController: AssistanceNeedDecisionController
    @Autowired private lateinit var assistanceNeedDecisionService: AssistanceNeedDecisionService
    @Autowired private lateinit var asyncJobRunner: AsyncJobRunner<AsyncJob>

    private val assistanceWorker =
        AuthenticatedUser.Employee(testDecisionMaker_1.id, setOf(UserRole.SERVICE_WORKER))
    private val decisionMaker =
        AuthenticatedUser.Employee(testDecisionMaker_2.id, setOf(UserRole.DIRECTOR))
    private val decisionMaker2 =
        AuthenticatedUser.Employee(testDecisionMaker_3.id, setOf(UserRole.DIRECTOR))

    private val testDecision =
        AssistanceNeedDecisionForm(
            validityPeriod = DateRange(LocalDate.of(2022, 1, 1), null),
            status = AssistanceNeedDecisionStatus.DRAFT,
            language = AssistanceNeedDecisionLanguage.FI,
            decisionMade = LocalDate.of(2021, 12, 31),
            sentForDecision = null,
            selectedUnit = UnitIdInfo(id = testDaycare.id),
            preparedBy1 =
                AssistanceNeedDecisionEmployeeForm(
                    employeeId = assistanceWorker.id,
                    title = "worker",
                    phoneNumber = "01020405060"
                ),
            preparedBy2 = null,
            decisionMaker =
                AssistanceNeedDecisionMakerForm(
                    employeeId = decisionMaker.id,
                    title = "Decider of everything"
                ),
            pedagogicalMotivation = "Pedagogical motivation",
            structuralMotivationOptions =
                StructuralMotivationOptions(
                    smallerGroup = false,
                    specialGroup = true,
                    smallGroup = false,
                    groupAssistant = false,
                    childAssistant = false,
                    additionalStaff = false
                ),
            structuralMotivationDescription = "Structural motivation description",
            careMotivation = "Care motivation",
            serviceOptions =
                ServiceOptions(
                    consultationSpecialEd = false,
                    partTimeSpecialEd = false,
                    fullTimeSpecialEd = false,
                    interpretationAndAssistanceServices = false,
                    specialAides = true
                ),
            servicesMotivation = "Services Motivation",
            expertResponsibilities = "Expert responsibilities",
            guardiansHeardOn = LocalDate.of(2021, 11, 30),
            guardianInfo =
                setOf(
                    AssistanceNeedDecisionGuardian(
                        id = null,
                        personId = testAdult_1.id,
                        name = "${testAdult_1.lastName} ${testAdult_1.firstName}",
                        isHeard = true,
                        details = "Lots of details"
                    )
                ),
            viewOfGuardians = "The view of the guardians",
            otherRepresentativeHeard = false,
            otherRepresentativeDetails = null,
            assistanceLevels = setOf(AssistanceLevel.ENHANCED_ASSISTANCE),
            motivationForDecision = "Motivation for decision"
        )

    @BeforeEach
    fun beforeEach() {
        db.transaction { tx ->
            tx.insertGeneralTestFixtures()
            tx.insertGuardian(testAdult_1.id, testChild_1.id)
        }
    }

    @Test
    fun `post and get an assistance need decision`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        assertEquals(testChild_1.id, assistanceNeedDecision.child?.id)
        assertEquals(testDecision.validityPeriod, assistanceNeedDecision.validityPeriod)
        assertEquals(testDecision.status, assistanceNeedDecision.status)
        assertEquals(testDecision.language, assistanceNeedDecision.language)
        assertEquals(testDecision.decisionMade, assistanceNeedDecision.decisionMade)
        assertEquals(testDecision.sentForDecision, assistanceNeedDecision.sentForDecision)
        assertEquals(assistanceNeedDecision.selectedUnit?.id, testDaycare.id)
        assertEquals(assistanceNeedDecision.selectedUnit?.name, testDaycare.name)
        assertEquals(assistanceNeedDecision.selectedUnit?.postOffice, "ESPOO")
        assertEquals(assistanceNeedDecision.selectedUnit?.postalCode, "02100")
        assertEquals(assistanceNeedDecision.selectedUnit?.streetAddress, "Joku katu 9")
        assertEquals(
            testDecision.preparedBy1?.employeeId,
            assistanceNeedDecision.preparedBy1?.employeeId
        )
        assertEquals(testDecision.preparedBy1?.title, assistanceNeedDecision.preparedBy1?.title)
        assertEquals(
            testDecision.preparedBy1?.phoneNumber,
            assistanceNeedDecision.preparedBy1?.phoneNumber
        )
        assertEquals(
            assistanceNeedDecision.preparedBy1?.name,
            "${testDecisionMaker_1.firstName} ${testDecisionMaker_1.lastName}"
        )
        assertEquals(assistanceNeedDecision.preparedBy2, null)
        assertEquals(
            testDecision.decisionMaker?.employeeId,
            assistanceNeedDecision.decisionMaker?.employeeId
        )
        assertEquals(testDecision.decisionMaker?.title, assistanceNeedDecision.decisionMaker?.title)
        assertEquals(
            assistanceNeedDecision.decisionMaker?.name,
            "${testDecisionMaker_2.firstName} ${testDecisionMaker_2.lastName}"
        )

        assertEquals(
            testDecision.pedagogicalMotivation,
            assistanceNeedDecision.pedagogicalMotivation
        )
        assertEquals(
            testDecision.structuralMotivationOptions,
            assistanceNeedDecision.structuralMotivationOptions
        )
        assertEquals(
            testDecision.structuralMotivationDescription,
            assistanceNeedDecision.structuralMotivationDescription
        )
        assertEquals(testDecision.careMotivation, assistanceNeedDecision.careMotivation)
        assertEquals(testDecision.serviceOptions, assistanceNeedDecision.serviceOptions)
        assertEquals(testDecision.servicesMotivation, assistanceNeedDecision.servicesMotivation)
        assertEquals(
            testDecision.expertResponsibilities,
            assistanceNeedDecision.expertResponsibilities
        )

        assertEquals(testDecision.guardiansHeardOn, assistanceNeedDecision.guardiansHeardOn)
        val storedGuardiansWithoutId =
            assistanceNeedDecision.guardianInfo
                .map { g ->
                    AssistanceNeedDecisionGuardian(
                        id = null,
                        personId = g.personId,
                        name = g.name,
                        isHeard = g.isHeard,
                        details = g.details
                    )
                }
                .toSet()
        assertEquals(testDecision.guardianInfo, storedGuardiansWithoutId)

        assertEquals(testDecision.viewOfGuardians, assistanceNeedDecision.viewOfGuardians)
        assertEquals(
            testDecision.otherRepresentativeHeard,
            assistanceNeedDecision.otherRepresentativeHeard
        )
        assertEquals(
            testDecision.otherRepresentativeDetails,
            assistanceNeedDecision.otherRepresentativeDetails
        )

        assertEquals(testDecision.assistanceLevels, assistanceNeedDecision.assistanceLevels)
        assertEquals(
            testDecision.motivationForDecision,
            assistanceNeedDecision.motivationForDecision
        )
    }

    @Test
    fun `posting without guardians adds guardians before saving`() {
        val testDecisionWithoutGuardian = testDecision.copy(guardianInfo = setOf())
        val assistanceNeedDecision =
            createAssistanceNeedDecision(
                AssistanceNeedDecisionRequest(decision = testDecisionWithoutGuardian)
            )
        val firstGuardian = assistanceNeedDecision.guardianInfo.first()
        assertEquals(testAdult_1.id, firstGuardian.personId)
        assertEquals("${testAdult_1.lastName} ${testAdult_1.firstName}", firstGuardian.name)
    }

    @Test
    fun `Updating a decision stores the new information`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))
        val updatedDecision =
            assistanceNeedDecision
                .copy(
                    pedagogicalMotivation = "Such Pedagogical motivation",
                    structuralMotivationOptions =
                        assistanceNeedDecision.structuralMotivationOptions,
                    structuralMotivationDescription = "Very Structural motivation",
                    careMotivation = "wow",
                    guardianInfo =
                        assistanceNeedDecision.guardianInfo
                            .map {
                                AssistanceNeedDecisionGuardian(
                                    id = it.id,
                                    personId = it.personId,
                                    name = it.name,
                                    isHeard = true,
                                    details = "Updated details"
                                )
                            }
                            .toSet()
                )
                .toForm()

        updateAssistanceNeedDecision(
            AssistanceNeedDecisionRequest(decision = updatedDecision),
            assistanceNeedDecision.id
        )

        val finalDecision = getAssistanceNeedDecision(assistanceNeedDecision.id)

        assertEquals(updatedDecision.pedagogicalMotivation, finalDecision.pedagogicalMotivation)
        assertEquals(
            updatedDecision.structuralMotivationDescription,
            finalDecision.structuralMotivationDescription
        )
        assertEquals(updatedDecision.careMotivation, finalDecision.careMotivation)
        assertEquals(updatedDecision.guardianInfo, finalDecision.guardianInfo)
    }

    @Test
    fun `Deleting a decision removes it`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        getAssistanceNeedDecision(assistanceNeedDecision.id)
        deleteAssistanceNeedDecision(assistanceNeedDecision.id)
        assertThrows<NotFound> { getAssistanceNeedDecision(assistanceNeedDecision.id) }
    }

    @Test
    fun `Sending a decision marks the sent date and disables editing and re-sending`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        sendAssistanceNeedDecision(assistanceNeedDecision.id)

        val sentDecision = getAssistanceNeedDecision(assistanceNeedDecision.id)
        assertEquals(LocalDate.now(), sentDecision.sentForDecision)

        assertThrows<Forbidden> { sendAssistanceNeedDecision(assistanceNeedDecision.id) }
        assertThrows<Forbidden> {
            updateAssistanceNeedDecision(
                AssistanceNeedDecisionRequest(
                    decision = assistanceNeedDecision.copy(pedagogicalMotivation = "Test").toForm()
                ),
                assistanceNeedDecision.id
            )
        }
    }

    @Test
    fun `Sent for decision and status cannot be changed using PUT`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        updateAssistanceNeedDecision(
            AssistanceNeedDecisionRequest(
                decision =
                    assistanceNeedDecision
                        .copy(
                            sentForDecision = LocalDate.of(2019, 1, 4),
                            status = AssistanceNeedDecisionStatus.ACCEPTED
                        )
                        .toForm()
            ),
            assistanceNeedDecision.id
        )

        val updatedDecision = getAssistanceNeedDecision(assistanceNeedDecision.id)

        assertEquals(assistanceNeedDecision.sentForDecision, updatedDecision.sentForDecision)
        assertEquals(assistanceNeedDecision.status, updatedDecision.status)
    }

    @Test
    fun `Newly created decisions have a draft status and don't have a sent for decision date`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(
                AssistanceNeedDecisionRequest(
                    decision =
                        testDecision.copy(
                            sentForDecision = LocalDate.of(2019, 1, 4),
                            status = AssistanceNeedDecisionStatus.ACCEPTED
                        )
                )
            )

        assertEquals(null, assistanceNeedDecision.sentForDecision)
        assertEquals(AssistanceNeedDecisionStatus.DRAFT, assistanceNeedDecision.status)
    }

    @Test
    fun `Decision maker can mark decision as opened`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        sendAssistanceNeedDecision(assistanceNeedDecision.id)
        assertThrows<Forbidden> {
            markAssistanceNeedDecisionOpened(assistanceNeedDecision.id, assistanceWorker)
        }
        markAssistanceNeedDecisionOpened(assistanceNeedDecision.id, decisionMaker)
    }

    @Test
    fun `Decision maker can make a decision`() {
        MockSfiMessagesClient.clearMessages()

        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        // must be sent before a decision can be made
        assertThrows<Forbidden> {
            decideAssistanceNeedDecision(
                assistanceNeedDecision.id,
                AssistanceNeedDecisionController.DecideAssistanceNeedDecisionRequest(
                    status = AssistanceNeedDecisionStatus.ACCEPTED
                ),
                decisionMaker,
            )
        }
        sendAssistanceNeedDecision(assistanceNeedDecision.id)
        // only the decision-maker can make the decision
        assertThrows<Forbidden> {
            decideAssistanceNeedDecision(
                assistanceNeedDecision.id,
                AssistanceNeedDecisionController.DecideAssistanceNeedDecisionRequest(
                    status = AssistanceNeedDecisionStatus.ACCEPTED
                ),
                assistanceWorker,
            )
        }
        // the decision cannot be DRAFT
        assertThrows<BadRequest> {
            decideAssistanceNeedDecision(
                assistanceNeedDecision.id,
                AssistanceNeedDecisionController.DecideAssistanceNeedDecisionRequest(
                    status = AssistanceNeedDecisionStatus.DRAFT
                ),
                decisionMaker,
            )
        }
        decideAssistanceNeedDecision(
            assistanceNeedDecision.id,
            AssistanceNeedDecisionController.DecideAssistanceNeedDecisionRequest(
                status = AssistanceNeedDecisionStatus.ACCEPTED
            ),
            decisionMaker,
        )
        val decision = getAssistanceNeedDecision(assistanceNeedDecision.id)
        assertEquals(LocalDate.now(), decision.decisionMade)
        // decisions cannot be re-decided
        assertThrows<BadRequest> {
            decideAssistanceNeedDecision(
                assistanceNeedDecision.id,
                AssistanceNeedDecisionController.DecideAssistanceNeedDecisionRequest(
                    status = AssistanceNeedDecisionStatus.REJECTED
                ),
                decisionMaker,
            )
        }

        asyncJobRunner.runPendingJobsSync(RealEvakaClock())

        val messages = MockSfiMessagesClient.getMessages()
        assertEquals(1, messages.size)
        assertContains(messages[0].first.messageContent, "päätös tuesta")
        assertNotNull(messages[0].second)
    }

    @Test
    fun `Decision maker can be changed`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        val request =
            AssistanceNeedDecisionController.UpdateDecisionMakerForAssistanceNeedDecisionRequest(
                title = "regional manager"
            )

        assertThrows<Forbidden> {
            updateDecisionMakerForAssistanceNeedDecision(
                assistanceNeedDecision.id,
                request,
                decisionMaker2,
            )
        }
        sendAssistanceNeedDecision(assistanceNeedDecision.id)
        updateDecisionMakerForAssistanceNeedDecision(
            assistanceNeedDecision.id,
            request,
            decisionMaker2,
        )

        val updatedDecision = getAssistanceNeedDecision(assistanceNeedDecision.id)

        assertEquals(decisionMaker2.id, updatedDecision.decisionMaker?.employeeId)
    }

    @Test
    fun `decision maker options returns 200 with employees`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        val decisionMakers = getDecisionMakerOptions(assistanceNeedDecision.id)

        assertEquals(
            listOf(
                Tuple(
                    testDecisionMaker_1.id,
                    testDecisionMaker_1.lastName,
                    testDecisionMaker_1.firstName
                ),
                Tuple(
                    testDecisionMaker_2.id,
                    testDecisionMaker_2.lastName,
                    testDecisionMaker_2.firstName
                ),
                Tuple(
                    testDecisionMaker_3.id,
                    testDecisionMaker_3.lastName,
                    testDecisionMaker_3.firstName
                ),
                Tuple(
                    unitSupervisorOfTestDaycare.id,
                    unitSupervisorOfTestDaycare.lastName,
                    unitSupervisorOfTestDaycare.firstName
                )
            ),
            decisionMakers.map { Tuple(it.id, it.lastName, it.firstName) }
        )
    }

    @Test
    fun `decision maker options returns 404 when assistance decision doesn't exist`() {
        assertThrows<NotFound> {
            getDecisionMakerOptions(
                AssistanceNeedDecisionId(UUID.randomUUID()),
                assistanceWorker,
            )
        }
    }

    @Test
    fun `decision maker options returns 403 when user doesn't have access`() {
        assertThrows<Forbidden> {
            getDecisionMakerOptions(
                AssistanceNeedDecisionId(UUID.randomUUID()),
                decisionMaker,
            )
        }
    }

    @Test
    fun `decision maker options returns employees with given roles`() {
        val directorId =
            db.transaction { tx ->
                tx.insertTestEmployee(
                    DevEmployee(
                        id = EmployeeId(UUID.randomUUID()),
                        firstName = "Fia",
                        lastName = "Finance",
                        roles = setOf(UserRole.FINANCE_ADMIN)
                    )
                )
                tx.insertTestEmployee(
                    DevEmployee(
                        id = EmployeeId(UUID.randomUUID()),
                        firstName = "Dirk",
                        lastName = "Director",
                        roles = setOf(UserRole.DIRECTOR)
                    )
                )
            }
        val assistanceDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        val decisionMakers =
            db.read { tx ->
                assistanceNeedDecisionService.getDecisionMakerOptions(
                    tx,
                    assistanceDecision.id,
                    setOf(UserRole.DIRECTOR, UserRole.UNIT_SUPERVISOR)
                )
            }

        assertEquals(
            listOf(
                Tuple(directorId, "Director", "Dirk"),
                Tuple(
                    unitSupervisorOfTestDaycare.id,
                    unitSupervisorOfTestDaycare.lastName,
                    unitSupervisorOfTestDaycare.firstName
                )
            ),
            decisionMakers.map { Tuple(it.id, it.lastName, it.firstName) }
        )
    }

    @Test
    fun `End date cannot be changed unless assistance services for time is selected`() {
        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        updateAssistanceNeedDecision(
            AssistanceNeedDecisionRequest(
                decision =
                    assistanceNeedDecision
                        .copy(
                            validityPeriod =
                                testDecision.validityPeriod.copy(end = LocalDate.of(2024, 1, 2)),
                            assistanceLevels = setOf(AssistanceLevel.SPECIAL_ASSISTANCE)
                        )
                        .toForm()
            ),
            assistanceNeedDecision.id
        )

        val updatedDecision = getAssistanceNeedDecision(assistanceNeedDecision.id)

        assertNull(updatedDecision.validityPeriod.end)

        val end = LocalDate.of(2024, 1, 2)

        updateAssistanceNeedDecision(
            AssistanceNeedDecisionRequest(
                decision =
                    assistanceNeedDecision
                        .copy(
                            validityPeriod = testDecision.validityPeriod.copy(end = end),
                            assistanceLevels = setOf(AssistanceLevel.ASSISTANCE_SERVICES_FOR_TIME)
                        )
                        .toForm()
            ),
            assistanceNeedDecision.id
        )

        val updatedDecisionWithAssistanceServices =
            getAssistanceNeedDecision(assistanceNeedDecision.id)
        assertEquals(updatedDecisionWithAssistanceServices.validityPeriod.end, end)

        updateAssistanceNeedDecision(
            AssistanceNeedDecisionRequest(
                decision =
                    assistanceNeedDecision
                        .copy(
                            validityPeriod = testDecision.validityPeriod.copy(end = null),
                            assistanceLevels = setOf(AssistanceLevel.ASSISTANCE_SERVICES_FOR_TIME)
                        )
                        .toForm()
            ),
            assistanceNeedDecision.id
        )

        assertThrows<BadRequest> { sendAssistanceNeedDecision(assistanceNeedDecision.id) }
    }

    @Test
    fun `Assistance need decision is notified via email to guardians`() {
        db.transaction { it.insertGuardian(testAdult_4.id, testChild_1.id) }

        val assistanceNeedDecision =
            createAssistanceNeedDecision(AssistanceNeedDecisionRequest(decision = testDecision))

        sendAssistanceNeedDecision(assistanceNeedDecision.id)
        decideAssistanceNeedDecision(
            assistanceNeedDecision.id,
            AssistanceNeedDecisionController.DecideAssistanceNeedDecisionRequest(
                status = AssistanceNeedDecisionStatus.ACCEPTED
            ),
            decisionMaker,
        )
        asyncJobRunner.runPendingJobsSync(RealEvakaClock())

        assertEquals(setOf(testAdult_4.email), MockEmailClient.emails.map { it.toAddress }.toSet())
        assertEquals(
            "Päätös eVakassa / Beslut i eVaka / Decision on eVaka",
            getEmailFor(testAdult_4).subject
        )
        assertEquals(
            "Test email sender fi <testemail_fi@test.com>",
            getEmailFor(testAdult_4).fromAddress
        )
    }

    private fun getEmailFor(person: DevPerson): MockEmail {
        val address = person.email ?: throw Error("$person has no email")
        return MockEmailClient.getEmail(address) ?: throw Error("No emails sent to $address")
    }

    @Test
    fun `Decision PDF generation is successful`() {
        val pdf =
            assistanceNeedDecisionService.generatePdf(
                sentDate = LocalDate.now(),
                AssistanceNeedDecision(
                    validityPeriod = DateRange(LocalDate.of(2022, 1, 1), LocalDate.of(2023, 1, 1)),
                    status = AssistanceNeedDecisionStatus.ACCEPTED,
                    language = AssistanceNeedDecisionLanguage.FI,
                    decisionMade = LocalDate.of(2021, 12, 31),
                    sentForDecision = null,
                    selectedUnit =
                        UnitInfo(
                            id = testDaycare.id,
                            name = "Test",
                            streetAddress = "Mallilankatu 1",
                            postalCode = "00100",
                            postOffice = "Mallila"
                        ),
                    preparedBy1 =
                        AssistanceNeedDecisionEmployee(
                            employeeId = assistanceWorker.id,
                            title = "worker",
                            phoneNumber = "01020405060",
                            name = "Jaakko Jokunen"
                        ),
                    preparedBy2 = null,
                    decisionMaker =
                        AssistanceNeedDecisionMaker(
                            employeeId = decisionMaker.id,
                            title = "Decider of everything",
                            name = "Mikko Mallila"
                        ),
                    pedagogicalMotivation = "Pedagogical motivation",
                    structuralMotivationOptions =
                        StructuralMotivationOptions(
                            smallerGroup = false,
                            specialGroup = true,
                            smallGroup = false,
                            groupAssistant = false,
                            childAssistant = false,
                            additionalStaff = false
                        ),
                    structuralMotivationDescription = "Structural motivation description",
                    careMotivation = "Care motivation",
                    serviceOptions =
                        ServiceOptions(
                            consultationSpecialEd = false,
                            partTimeSpecialEd = false,
                            fullTimeSpecialEd = false,
                            interpretationAndAssistanceServices = false,
                            specialAides = true
                        ),
                    servicesMotivation = "Services Motivation",
                    expertResponsibilities = "Expert responsibilities",
                    guardiansHeardOn = LocalDate.of(2021, 11, 30),
                    guardianInfo =
                        setOf(
                            AssistanceNeedDecisionGuardian(
                                id = null,
                                personId = testAdult_1.id,
                                name = "${testAdult_1.lastName} ${testAdult_1.firstName}",
                                isHeard = true,
                                details = "Lots of details"
                            )
                        ),
                    viewOfGuardians = "The view of the guardians",
                    otherRepresentativeHeard = false,
                    otherRepresentativeDetails = null,
                    assistanceLevels = setOf(AssistanceLevel.ASSISTANCE_SERVICES_FOR_TIME),
                    motivationForDecision = "Motivation for decision",
                    hasDocument = false,
                    id = AssistanceNeedDecisionId(UUID.randomUUID()),
                    child =
                        AssistanceNeedDecisionChild(
                            id = ChildId(UUID.randomUUID()),
                            name = "Test Example",
                            dateOfBirth = LocalDate.of(2012, 1, 4)
                        )
                )
            )

        assertNotNull(pdf)

        val file = File.createTempFile("assistance_need_decision_", ".pdf")

        FileOutputStream(file).use { it.write(pdf) }

        logger.debug { "Generated assistance need decision PDF to ${file.absolutePath}" }
    }

    private fun createAssistanceNeedDecision(
        request: AssistanceNeedDecisionRequest
    ): AssistanceNeedDecision {
        return assistanceNeedDecisionController.createAssistanceNeedDecision(
            dbInstance(),
            assistanceWorker,
            RealEvakaClock(),
            testChild_1.id,
            request
        )
    }

    private fun getAssistanceNeedDecision(id: AssistanceNeedDecisionId): AssistanceNeedDecision {
        return assistanceNeedDecisionController
            .getAssistanceNeedDecision(dbInstance(), assistanceWorker, RealEvakaClock(), id)
            .decision
    }

    private fun deleteAssistanceNeedDecision(id: AssistanceNeedDecisionId) {
        assistanceNeedDecisionController.deleteAssistanceNeedDecision(
            dbInstance(),
            assistanceWorker,
            RealEvakaClock(),
            id
        )
    }

    private fun sendAssistanceNeedDecision(
        id: AssistanceNeedDecisionId,
    ) {
        assistanceNeedDecisionController.sendAssistanceNeedDecision(
            dbInstance(),
            assistanceWorker,
            RealEvakaClock(),
            id
        )
    }

    private fun updateAssistanceNeedDecision(
        request: AssistanceNeedDecisionRequest,
        decisionId: AssistanceNeedDecisionId
    ) {
        assistanceNeedDecisionController.updateAssistanceNeedDecision(
            dbInstance(),
            assistanceWorker,
            RealEvakaClock(),
            decisionId,
            request
        )
    }

    private fun markAssistanceNeedDecisionOpened(
        id: AssistanceNeedDecisionId,
        user: AuthenticatedUser
    ) {
        assistanceNeedDecisionController.markAssistanceNeedDecisionAsOpened(
            dbInstance(),
            user,
            RealEvakaClock(),
            id
        )
    }

    private fun decideAssistanceNeedDecision(
        id: AssistanceNeedDecisionId,
        request: AssistanceNeedDecisionController.DecideAssistanceNeedDecisionRequest,
        user: AuthenticatedUser,
    ) {
        assistanceNeedDecisionController.decideAssistanceNeedDecision(
            dbInstance(),
            user,
            RealEvakaClock(),
            id,
            request
        )
    }

    private fun updateDecisionMakerForAssistanceNeedDecision(
        id: AssistanceNeedDecisionId,
        request:
            AssistanceNeedDecisionController.UpdateDecisionMakerForAssistanceNeedDecisionRequest,
        user: AuthenticatedUser,
    ) {
        assistanceNeedDecisionController.updateAssistanceNeedDecisionDecisionMaker(
            dbInstance(),
            user,
            RealEvakaClock(),
            id,
            request
        )
    }

    private fun getDecisionMakerOptions(
        id: AssistanceNeedDecisionId,
        user: AuthenticatedUser = assistanceWorker,
    ): List<Employee> {
        return assistanceNeedDecisionController.getAssistanceDecisionMakerOptions(
            dbInstance(),
            user,
            RealEvakaClock(),
            id
        )
    }
}
