// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.invoicing.service

import fi.espoo.evaka.FullApplicationTest
import fi.espoo.evaka.absence.AbsenceCategory
import fi.espoo.evaka.absence.AbsenceType
import fi.espoo.evaka.invoicing.controller.InvoiceController
import fi.espoo.evaka.invoicing.data.getInvoice
import fi.espoo.evaka.invoicing.data.searchInvoices
import fi.espoo.evaka.invoicing.domain.FeeDecisionStatus
import fi.espoo.evaka.invoicing.domain.InvoiceDetailed
import fi.espoo.evaka.invoicing.domain.InvoiceReplacementReason
import fi.espoo.evaka.invoicing.domain.InvoiceStatus
import fi.espoo.evaka.shared.FeeDecisionId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.PlacementId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.auth.UserRole
import fi.espoo.evaka.shared.dev.DevAbsence
import fi.espoo.evaka.shared.dev.DevCareArea
import fi.espoo.evaka.shared.dev.DevDaycare
import fi.espoo.evaka.shared.dev.DevEmployee
import fi.espoo.evaka.shared.dev.DevFeeDecision
import fi.espoo.evaka.shared.dev.DevFeeDecisionChild
import fi.espoo.evaka.shared.dev.DevPerson
import fi.espoo.evaka.shared.dev.DevPersonType
import fi.espoo.evaka.shared.dev.DevPlacement
import fi.espoo.evaka.shared.dev.feeThresholds2020
import fi.espoo.evaka.shared.dev.insert
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.domain.MockEvakaClock
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired

class ReplacementInvoicesIntegrationTest : FullApplicationTest(resetDbBeforeEach = true) {
    @Autowired private lateinit var invoiceService: InvoiceService
    @Autowired private lateinit var invoiceController: InvoiceController

    @Autowired private lateinit var draftInvoiceGenerator: DraftInvoiceGenerator
    @Autowired private lateinit var invoiceGenerationLogicChooser: InvoiceGenerationLogicChooser

    private val replacementInvoicesStart = YearMonth.of(2021, 1)
    private lateinit var invoiceGenerator: InvoiceGenerator

    private val now = HelsinkiDateTime.of(LocalDate.of(2024, 11, 4), LocalTime.of(8, 0))
    private val today = now.toLocalDate()
    private val previousMonth = YearMonth.from(today).minusMonths(1)

    private val area = DevCareArea()
    private val daycare = DevDaycare(areaId = area.id)
    private val headOfFamily = DevPerson(ssn = "010101-9999")
    private val child = DevPerson()

    @BeforeEach
    fun beforeEach() {
        invoiceGenerator =
            InvoiceGenerator(
                draftInvoiceGenerator,
                featureConfig,
                evakaEnv.copy(replacementInvoicesStart = replacementInvoicesStart),
                invoiceGenerationLogicChooser,
            )
        db.transaction { tx ->
            tx.insert(feeThresholds2020)
            tx.insert(area)
            tx.insert(daycare)
            tx.insert(headOfFamily, DevPersonType.ADULT)
            tx.insert(child, DevPersonType.CHILD)
        }
    }

    @Test
    fun `replacement draft invoice is created when a force majeure absence is added retroactively`() {
        insertPlacementAndFeeDecision(fee = 29500)

        val original = generateAndSendInvoices().single()
        assertEquals(InvoiceStatus.SENT, original.status)
        assertEquals(29500, original.totalPrice)

        db.transaction { tx ->
            tx.insert(
                DevAbsence(
                    childId = child.id,
                    date = previousMonth.atDay(1),
                    absenceCategory = AbsenceCategory.BILLABLE,
                    absenceType = AbsenceType.FORCE_MAJEURE,
                )
            )
        }

        val replacement = generateReplacementDrafts().single()

        assertEquals(InvoiceStatus.REPLACEMENT_DRAFT, replacement.status)
        assertEquals(original.id, replacement.replacedInvoiceId)
        assertEquals(1, replacement.revisionNumber)
        assertTrue(replacement.totalPrice < original.totalPrice)

        assertEquals(original.periodStart, replacement.periodStart)
        assertEquals(original.periodEnd, replacement.periodEnd)
        assertEquals(original.dueDate, replacement.dueDate)
        assertEquals(original.invoiceDate, replacement.invoiceDate)
        assertEquals(original.agreementType, replacement.agreementType)
        assertEquals(original.areaId, replacement.areaId)
        assertEquals(original.headOfFamily, replacement.headOfFamily)
        assertEquals(original.codebtor, replacement.codebtor)
        assertEquals(null, replacement.number)
        assertEquals(null, replacement.sentBy)
        assertEquals(null, replacement.sentAt)
        assertEquals(original.relatedFeeDecisions.toSet(), replacement.relatedFeeDecisions.toSet())
    }

    @Test
    fun `invoice is not replaced if total price doesn't change`() {
        insertPlacementAndFeeDecision()
        generateAndSendInvoices()

        db.transaction { tx ->
            tx.insert(
                DevAbsence(
                    childId = child.id,
                    date = previousMonth.atDay(1),
                    absenceCategory = AbsenceCategory.BILLABLE,
                    absenceType = AbsenceType.OTHER_ABSENCE,
                )
            )
        }

        val replacements = generateReplacementDrafts()
        assertEquals(0, replacements.size)
    }

    @Test
    fun `zero-priced replacement is created`() {
        insertPlacementAndFeeDecision()
        val original = generateAndSendInvoices().single()

        // Sick leave for whole month => no fee
        db.transaction { tx ->
            generateSequence(previousMonth.atDay(1)) { it.plusDays(1) }
                .takeWhile { it <= previousMonth.atEndOfMonth() }
                .forEach { date ->
                    tx.insert(
                        DevAbsence(
                            childId = child.id,
                            date = date,
                            absenceCategory = AbsenceCategory.BILLABLE,
                            absenceType = AbsenceType.SICKLEAVE,
                        )
                    )
                }
        }

        val replacement = generateReplacementDrafts().single()

        assertEquals(original.id, replacement.replacedInvoiceId)
        assertEquals(1, replacement.revisionNumber)
        assertEquals(0, replacement.totalPrice)
    }

    @Test
    fun `zero-priced replacement is created if replacement's total would be under minimumInvoiceAmount`() {
        whenever(featureConfig.minimumInvoiceAmount).thenReturn(1500)
        insertPlacementAndFeeDecision()

        val original = generateAndSendInvoices().single()

        // Force majeure absence for all except one day => total fee is under minimumInvoiceAmount
        db.transaction { tx ->
            generateSequence(previousMonth.atDay(1)) { it.plusDays(1) }
                .takeWhile { it < previousMonth.atEndOfMonth() }
                .forEach { date ->
                    tx.insert(
                        DevAbsence(
                            childId = child.id,
                            date = date,
                            absenceCategory = AbsenceCategory.BILLABLE,
                            absenceType = AbsenceType.FORCE_MAJEURE,
                        )
                    )
                }
        }

        val replacement = generateReplacementDrafts().single()

        assertEquals(original.id, replacement.replacedInvoiceId)
        assertEquals(1, replacement.revisionNumber)
        assertEquals(0, replacement.totalPrice)
    }

    @Test
    fun `replacement draft is created without original invoice`() {
        insertPlacementAndFeeDecision()

        val replacement = generateReplacementDrafts().single()

        assertEquals(InvoiceStatus.REPLACEMENT_DRAFT, replacement.status)
        assertEquals(null, replacement.replacedInvoiceId)
        assertEquals(1, replacement.revisionNumber)
    }

    @Test
    fun `replacements are generated 12 months to the past from the last sent invoice`() {
        val twoMonthsAgo = previousMonth.minusMonths(1)

        // Generate and send an unrelated invoice to make `twoMonthsAgo` the last invoiced month
        val headOfFamily2 = DevPerson(ssn = "010101-9998")
        val child2 = DevPerson()
        db.transaction { tx ->
            tx.insert(headOfFamily2, DevPersonType.ADULT)
            tx.insert(child2, DevPersonType.CHILD)
        }
        insertPlacementAndFeeDecision(
            headOfFamily = headOfFamily2,
            child = child2,
            fee = 29500,
            range = FiniteDateRange.ofMonth(twoMonthsAgo),
        )
        generateAndSendInvoices(twoMonthsAgo)

        insertPlacementAndFeeDecision(
            fee = 29500,
            range =
                FiniteDateRange(
                    previousMonth.minusMonths(13).atDay(1),
                    YearMonth.from(today).atEndOfMonth(),
                ),
        )
        val replacements = generateReplacementDrafts()

        assertEquals(replacements.size, 12)
        assertEquals(
            twoMonthsAgo.minusMonths(11),
            replacements.minBy { it.periodStart }.targetMonth(),
        )
        assertEquals(twoMonthsAgo, replacements.maxBy { it.periodStart }.targetMonth())
        replacements.forEach { replacement ->
            assertEquals(InvoiceStatus.REPLACEMENT_DRAFT, replacement.status)
            assertEquals(null, replacement.replacedInvoiceId)
            assertEquals(1, replacement.revisionNumber)
            assertEquals(29500, replacement.totalPrice)
        }
    }

    @Test
    fun `replacements are generated from configured replacementInvoicesStart month`() {
        val startMonth = replacementInvoicesStart.minusMonths(6)
        val endMonth = replacementInvoicesStart.plusMonths(5)
        val currentMonth = endMonth.plusMonths(1)

        insertPlacementAndFeeDecision(
            range = FiniteDateRange(startMonth.atDay(1), endMonth.atEndOfMonth())
        )

        val replacements =
            generateReplacementDrafts(today = currentMonth.atDay(1)).sortedBy { it.periodStart }

        assertEquals(replacements.size, 6)
        assertEquals(replacements[0].periodStart, replacementInvoicesStart.atDay(1))
        assertEquals(replacements[5].periodEnd, endMonth.atEndOfMonth())
    }

    @Test
    fun `replacement invoice are generated for a multiple heads of family`() {
        val headOfFamily2 = DevPerson(ssn = "010101-9998")
        val child2 = DevPerson()
        db.transaction { tx ->
            tx.insert(headOfFamily2, DevPersonType.ADULT)
            tx.insert(child2, DevPersonType.CHILD)
        }

        insertPlacementAndFeeDecision(headOfFamily, child)
        insertPlacementAndFeeDecision(headOfFamily2, child2)

        val original = generateAndSendInvoices()

        db.transaction { tx ->
            listOf(child.id, child2.id).forEach { childId ->
                tx.insert(
                    DevAbsence(
                        childId = childId,
                        date = previousMonth.atDay(1),
                        absenceCategory = AbsenceCategory.BILLABLE,
                        absenceType = AbsenceType.FORCE_MAJEURE,
                    )
                )
            }
        }

        val replacement = generateReplacementDrafts()

        assertEquals(2, original.size)
        assertTrue(original.any { it.headOfFamily.id == headOfFamily.id })
        assertTrue(original.any { it.headOfFamily.id == headOfFamily2.id })
        assertEquals(2, replacement.size)
        assertTrue(replacement.any { it.headOfFamily.id == headOfFamily.id })
        assertTrue(replacement.any { it.headOfFamily.id == headOfFamily2.id })
    }

    @Test
    fun `replacement invoice are generated for an individual head of family`() {
        val headOfFamily2 = DevPerson(ssn = "010101-9998")
        val child2 = DevPerson()
        db.transaction { tx ->
            tx.insert(headOfFamily2, DevPersonType.ADULT)
            tx.insert(child2, DevPersonType.CHILD)
        }

        insertPlacementAndFeeDecision(headOfFamily, child)
        insertPlacementAndFeeDecision(headOfFamily2, child2)

        val original = generateAndSendInvoices()

        db.transaction { tx ->
            listOf(child.id, child2.id).forEach { childId ->
                tx.insert(
                    DevAbsence(
                        childId = childId,
                        date = previousMonth.atDay(1),
                        absenceCategory = AbsenceCategory.BILLABLE,
                        absenceType = AbsenceType.FORCE_MAJEURE,
                    )
                )
            }
        }

        val replacement = generateReplacementDraftsForHeadOfFamily(headOfFamily.id)

        assertEquals(2, original.size)
        assertTrue(original.any { it.headOfFamily.id == headOfFamily.id })
        assertTrue(original.any { it.headOfFamily.id == headOfFamily2.id })
        assertEquals(1, replacement.size)
        assertEquals(headOfFamily.id, replacement.single().headOfFamily.id)
    }

    @Test
    fun `replacement invoice can be marked as sent`() {
        val employee = DevEmployee(roles = setOf(UserRole.FINANCE_ADMIN))

        insertPlacementAndFeeDecision()
        val original = generateAndSendInvoices().single()

        db.transaction { tx ->
            tx.insert(employee)
            tx.insert(
                DevAbsence(
                    childId = child.id,
                    date = previousMonth.atDay(1),
                    absenceCategory = AbsenceCategory.BILLABLE,
                    absenceType = AbsenceType.FORCE_MAJEURE,
                )
            )
        }
        val replacement = generateReplacementDrafts().single()

        invoiceController.markReplacementDraftSent(
            dbInstance(),
            employee.user,
            MockEvakaClock(now),
            replacement.id,
            InvoiceController.MarkReplacementDraftSentRequest(
                reason = InvoiceReplacementReason.ABSENCE,
                notes = "foo bar baz",
            ),
        )

        val originalAfter = db.read { tx -> tx.getInvoice(original.id) }!!
        val replacementAfter = db.read { tx -> tx.getInvoice(replacement.id) }!!

        assertEquals(originalAfter.status, InvoiceStatus.REPLACED)

        assertEquals(replacementAfter.status, InvoiceStatus.SENT)
        assertEquals(replacementAfter.sentBy?.id, employee.evakaUserId)
        assertEquals(replacementAfter.sentAt, now)
        assertEquals(replacementAfter.replacementReason, InvoiceReplacementReason.ABSENCE)
        assertEquals(replacementAfter.replacementNotes, "foo bar baz")
    }

    @Test
    fun `replacement invoice can be marked as sent even if there is no invoice to be replaced`() {
        val employee = DevEmployee(roles = setOf(UserRole.FINANCE_ADMIN))
        db.transaction { tx -> tx.insert(employee) }

        insertPlacementAndFeeDecision()
        val replacement = generateReplacementDrafts().single()

        invoiceController.markReplacementDraftSent(
            dbInstance(),
            employee.user,
            MockEvakaClock(now),
            replacement.id,
            InvoiceController.MarkReplacementDraftSentRequest(
                reason = InvoiceReplacementReason.ABSENCE,
                notes = "foo bar baz",
            ),
        )

        val replacementAfter = db.read { tx -> tx.getInvoice(replacement.id) }!!
        assertEquals(replacementAfter.status, InvoiceStatus.SENT)
    }

    @Test
    fun `no replacement drafts are created anymore after placement ends`() {
        val employee = DevEmployee(roles = setOf(UserRole.FINANCE_ADMIN))
        db.transaction { tx -> tx.insert(employee) }

        val month1 = previousMonth.minusMonths(1)
        val month2 = previousMonth

        val (placementId, feeDecisionId) =
            insertPlacementAndFeeDecision(
                range =
                    // 2 months
                    FiniteDateRange(month1.atDay(1), month2.atEndOfMonth())
            )

        generateAndSendInvoices(month1)
        generateAndSendInvoices(month2)
        val original =
            db.read { it.searchInvoices(period = FiniteDateRange.ofMonth(month2)) }.single()

        // Shorten the placement and fee decision to only cover month1 => a zero replacement is
        // created for month2
        db.transaction { tx ->
            tx.execute {
                sql(
                    """
                    UPDATE placement
                    SET end_date = ${bind(month1.atEndOfMonth())}
                    WHERE id = ${bind(placementId)}
                    """
                )
            }
            tx.execute {
                sql(
                    """
                    UPDATE fee_decision
                    SET valid_during = ${bind(FiniteDateRange.ofMonth(month1))}
                    WHERE id = ${bind(feeDecisionId)}
                    """
                )
            }
        }
        val replacement = generateReplacementDrafts().single()
        assertEquals(month2, YearMonth.from(replacement.periodStart))
        assertEquals(original.id, replacement.replacedInvoiceId)
        assertEquals(1, replacement.revisionNumber)
        assertEquals(0, replacement.totalPrice)

        invoiceController.markReplacementDraftSent(
            dbInstance(),
            employee.user,
            MockEvakaClock(now),
            replacement.id,
            InvoiceController.MarkReplacementDraftSentRequest(
                reason = InvoiceReplacementReason.OTHER,
                notes = "ended early",
            ),
        )

        val originalAfter = db.read { tx -> tx.getInvoice(original.id) }!!
        assertEquals(InvoiceStatus.REPLACED, originalAfter.status)
        val replacementAfter = db.read { tx -> tx.getInvoice(replacement.id) }!!
        assertEquals(InvoiceStatus.SENT, replacementAfter.status)

        // A new replacement draft is not created anymore
        val replacements = generateReplacementDrafts()
        assertEquals(emptyList(), replacements)
    }

    private fun generateReplacementDrafts(today: LocalDate = this.today): List<InvoiceDetailed> {
        invoiceGenerator.generateAllReplacementDraftInvoices(db, today)
        return db.read { tx -> tx.searchInvoices(InvoiceStatus.REPLACEMENT_DRAFT) }
    }

    private fun generateReplacementDraftsForHeadOfFamily(
        headOfFamilyId: PersonId
    ): List<InvoiceDetailed> {
        invoiceGenerator.generateReplacementDraftInvoicesForHeadOfFamily(db, today, headOfFamilyId)
        return db.read { tx -> tx.searchInvoices(InvoiceStatus.REPLACEMENT_DRAFT) }
    }

    private fun insertPlacementAndFeeDecision(
        headOfFamily: DevPerson = this.headOfFamily,
        child: DevPerson = this.child,
        fee: Int = 29500,
        range: FiniteDateRange = FiniteDateRange.ofMonth(previousMonth),
    ): Pair<PlacementId, FeeDecisionId> {
        val placement =
            DevPlacement(
                childId = child.id,
                unitId = daycare.id,
                startDate = range.start,
                endDate = range.end,
            )
        val feeDecision =
            DevFeeDecision(
                status = FeeDecisionStatus.SENT,
                validDuring = range,
                headOfFamilyId = headOfFamily.id,
                totalFee = 29500,
            )
        db.transaction { tx ->
            tx.insert(placement)
            tx.insert(feeDecision)
            tx.insert(
                DevFeeDecisionChild(
                    feeDecisionId = feeDecision.id,
                    childId = child.id,
                    childDateOfBirth = child.dateOfBirth,
                    placementUnitId = daycare.id,
                    baseFee = fee,
                    fee = fee,
                    finalFee = fee,
                )
            )
        }
        return placement.id to feeDecision.id
    }

    private fun generateAndSendInvoices(month: YearMonth = previousMonth): List<InvoiceDetailed> =
        db.transaction { tx ->
            invoiceGenerator.generateAllDraftInvoices(tx, month)
            invoiceService.sendInvoices(
                tx,
                AuthenticatedUser.SystemInternalUser.evakaUserId,
                now,
                tx.searchInvoices(InvoiceStatus.DRAFT).map { it.id },
                null,
                null,
            )
            tx.searchInvoices()
        }
}
