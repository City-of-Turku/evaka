package fi.espoo.evaka.timeline

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.insertGeneralTestFixtures
import fi.espoo.evaka.invoicing.domain.IncomeEffect
import fi.espoo.evaka.shared.EvakaUserId
import fi.espoo.evaka.shared.IncomeId
import fi.espoo.evaka.shared.ParentshipId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.dev.DevIncome
import fi.espoo.evaka.shared.dev.insertTestIncome
import fi.espoo.evaka.shared.dev.insertTestParentship
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.MockEvakaClock
import fi.espoo.evaka.testAdult_1
import fi.espoo.evaka.testChild_1
import fi.espoo.evaka.testDecisionMaker_1
import java.time.LocalDate
import java.util.*
import kotlin.test.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

class TimelineControllerIntegrationTest : FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired private lateinit var controller: TimelineController

    private val range =
        FiniteDateRange(
            LocalDate.of(2022, 1, 1),
            LocalDate.of(2023, 1, 1),
        )

    @BeforeEach
    fun beforeEach() {
        db.transaction { tx -> tx.insertGeneralTestFixtures() }
    }

    @Test
    fun `timeline for empty person`() {
        val timeline = getTimeline(testAdult_1.id)
        assertEquals(
            Timeline(
                personId = testAdult_1.id,
                firstName = testAdult_1.firstName,
                lastName = testAdult_1.lastName,
                feeDecisions = emptyList(),
                incomes = emptyList(),
                partners = emptyList(),
                children = emptyList()
            ),
            timeline
        )
    }

    @Test
    fun `smoke test`() {
        val childRange = FiniteDateRange(LocalDate.of(2022, 3, 1), LocalDate.of(2022, 6, 1))
        var parentshipId: ParentshipId? = null
        val incomeId = IncomeId(UUID.randomUUID())

        db.transaction { tx ->
            parentshipId =
                tx.insertTestParentship(
                    testAdult_1.id,
                    testChild_1.id,
                    startDate = childRange.start,
                    endDate = childRange.end
                )

            // outside range is ignored
            tx.insertTestParentship(
                testAdult_1.id,
                testChild_1.id,
                startDate = range.start.minusYears(2),
                endDate = range.start.minusYears(1)
            )

            tx.insertTestIncome(
                DevIncome(
                    testChild_1.id,
                    id = incomeId,
                    validFrom = childRange.start,
                    validTo = childRange.end,
                    effect = IncomeEffect.INCOME,
                    updatedBy = EvakaUserId(testDecisionMaker_1.id.raw)
                )
            )
        }

        val timeline = getTimeline(testAdult_1.id)
        assertEquals(
            Timeline(
                personId = testAdult_1.id,
                firstName = testAdult_1.firstName,
                lastName = testAdult_1.lastName,
                feeDecisions = emptyList(),
                incomes = emptyList(),
                partners = emptyList(),
                children =
                    listOf(
                        TimelineChildDetailed(
                            parentshipId!!,
                            childRange.asDateRange(),
                            testChild_1.id,
                            testChild_1.firstName,
                            testChild_1.lastName,
                            testChild_1.dateOfBirth,
                            incomes =
                                listOf(
                                    TimelineIncome(
                                        incomeId,
                                        childRange.asDateRange(),
                                        IncomeEffect.INCOME
                                    )
                                ),
                            placements = listOf(),
                            serviceNeeds = listOf()
                        )
                    )
            ),
            timeline
        )
    }

    private fun getTimeline(personId: PersonId): Timeline {
        return controller.getTimeline(
            dbInstance(),
            AuthenticatedUser.Employee(testDecisionMaker_1.id, setOf(UserRole.FINANCE_ADMIN)),
            MockEvakaClock(2022, 9, 1, 0, 0),
            personId,
            range.start,
            range.end
        )
    }
}
