// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.invoicing.service

import fi.espoo.evaka.absence.AbsenceType
import fi.espoo.evaka.invoicing.domain.ChildWithDateOfBirth
import fi.espoo.evaka.invoicing.domain.DraftInvoice
import fi.espoo.evaka.invoicing.domain.DraftInvoiceRow
import fi.espoo.evaka.invoicing.domain.FeeAlterationType
import fi.espoo.evaka.invoicing.domain.FeeDecision
import fi.espoo.evaka.invoicing.domain.FeeDecisionChild
import fi.espoo.evaka.invoicing.domain.FeeThresholds
import fi.espoo.evaka.invoicing.domain.calculateMaxFee
import fi.espoo.evaka.invoicing.domain.feeAlterationEffect
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.serviceneed.ServiceNeedOption
import fi.espoo.evaka.shared.AreaId
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.DaycareId
import fi.espoo.evaka.shared.FeatureConfig
import fi.espoo.evaka.shared.FeeDecisionId
import fi.espoo.evaka.shared.PersonId
import fi.espoo.evaka.shared.Tracing
import fi.espoo.evaka.shared.data.DateMap
import fi.espoo.evaka.shared.data.DateSet
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.noopTracer
import fi.espoo.evaka.shared.withSpan
import fi.espoo.evaka.shared.withValue
import io.opentelemetry.api.trace.Tracer
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import org.springframework.stereotype.Component

interface InvoiceGenerationLogicChooser {
    fun getFreeChildren(tx: Database.Read, month: YearMonth, childIds: Set<ChildId>): Set<ChildId>
}

object DefaultInvoiceGenerationLogic : InvoiceGenerationLogicChooser {
    override fun getFreeChildren(
        tx: Database.Read,
        month: YearMonth,
        childIds: Set<ChildId>,
    ): Set<ChildId> = emptySet()
}

data class InvoiceGeneratorConfig(
    val dailyFeeDivisorOperationalDaysOverride: Int?,
    val freeAbsenceGivesADailyRefund: Boolean,
    val freeSickLeaveOnContractDays: Boolean,
    val maxContractDaySurplusThreshold: Int?,
    val temporaryDaycarePartDayAbsenceGivesADailyRefund: Boolean,
    val unplannedAbsencesAreContractSurplusDays: Boolean,
    val useContractDaysAsDailyFeeDivisor: Boolean,
) {
    companion object {
        fun fromFeatureConfig(featureConfig: FeatureConfig) =
            InvoiceGeneratorConfig(
                dailyFeeDivisorOperationalDaysOverride =
                    featureConfig.dailyFeeDivisorOperationalDaysOverride,
                freeAbsenceGivesADailyRefund = featureConfig.freeAbsenceGivesADailyRefund,
                freeSickLeaveOnContractDays = featureConfig.freeSickLeaveOnContractDays,
                maxContractDaySurplusThreshold = featureConfig.maxContractDaySurplusThreshold,
                temporaryDaycarePartDayAbsenceGivesADailyRefund =
                    featureConfig.temporaryDaycarePartDayAbsenceGivesADailyRefund,
                unplannedAbsencesAreContractSurplusDays =
                    featureConfig.unplannedAbsencesAreContractSurplusDays,
                useContractDaysAsDailyFeeDivisor = featureConfig.useContractDaysAsDailyFeeDivisor,
            )
    }
}

@Component
class DraftInvoiceGenerator(
    private val productProvider: InvoiceProductProvider,
    featureConfig: FeatureConfig,
    private val tracer: Tracer = noopTracer(),
) {
    private val config = InvoiceGeneratorConfig.fromFeatureConfig(featureConfig)

    fun generateDraftInvoices(invoiceInput: InvoiceGeneratorInput): List<DraftInvoice> {
        val headsOfFamily = invoiceInput.decisions.keys + invoiceInput.temporaryPlacements.keys
        return headsOfFamily.mapNotNull { headOfFamilyId ->
            try {
                val headOfFamilyDecisions = invoiceInput.decisions[headOfFamilyId] ?: listOf()
                val feeDecisionPlacements =
                    headOfFamilyDecisions.flatMap { decision ->
                        decision.children.flatMap { child ->
                            invoiceInput.permanentPlacements[child.child.id] ?: listOf()
                        }
                    }

                tracer.withSpan(
                    "generateDraftInvoice",
                    Tracing.headOfFamilyId withValue headOfFamilyId,
                ) {
                    generateDraftInvoice(
                        invoiceInput,
                        HeadOfFamilyInput(
                            config,
                            invoiceInput,
                            headOfFamilyId,
                            invoiceInput.codebtors[headOfFamilyId],
                            headOfFamilyDecisions,
                            feeDecisionPlacements +
                                (invoiceInput.temporaryPlacements[headOfFamilyId] ?: listOf()),
                        ),
                    )
                }
            } catch (e: Exception) {
                error("Failed to generate invoice for head of family $headOfFamilyId: $e")
            }
        }
    }

    private fun generateDraftInvoice(
        invoiceInput: InvoiceGeneratorInput,
        headInput: HeadOfFamilyInput,
    ): DraftInvoice? {
        val rowInputsByChild =
            headInput.placements
                .groupBy { (_, placement) -> placement.child }
                .asSequence()
                .sortedByDescending { (child, _) -> child.dateOfBirth }
                .flatMapIndexed { siblingIndex, (child, placements) ->
                    placements.flatMap { (placementPeriod, placement) ->
                        val relevantPeriod =
                            invoiceInput.invoicePeriod.intersection(placementPeriod)!!
                        when (placement.type) {
                            PlacementType.TEMPORARY_DAYCARE,
                            PlacementType.TEMPORARY_DAYCARE_PART_DAY -> {
                                listOf(
                                    relevantPeriod to
                                        RowInput.fromTemporaryPlacement(
                                            invoiceInput.feeThresholds,
                                            child,
                                            placement,
                                            siblingIndex + 1,
                                        )
                                )
                            }
                            else ->
                                headInput.decisions
                                    .filter { placementPeriod.overlaps(it.validDuring) }
                                    .mapNotNull { decision ->
                                        decision.children
                                            .find { part -> part.child == child }
                                            ?.let { decision.validDuring to it }
                                    }
                                    .filterNot { (_, part) ->
                                        invoiceInput.freeChildren.contains(part.child.id)
                                    }
                                    .map { (decisionPeriod, part) ->
                                        relevantPeriod.intersection(decisionPeriod)!! to
                                            RowInput.fromFeeDecisionPart(part)
                                    }
                        }
                    }
                }
                .groupBy { (_, rowInput) -> rowInput.child }
                .map { (child, rowInputs) ->
                    // Merge adjacent periods with identical data
                    child to DateMap.of(rowInputs).entries().toList()
                }

        val rows =
            rowInputsByChild
                .flatMap { (child, rowInputs) ->
                    val childInput = ChildInput(config, invoiceInput, headInput, child)

                    val invoiceRows = mutableListOf<DraftInvoiceRow>()
                    var invoiceRowSum = 0
                    rowInputs
                        .filter { (_, rowInput) -> rowInput.finalPrice != 0 }
                        .forEach { (period, rowInput) ->
                            val rows =
                                when (rowInput.placementType) {
                                    PlacementType.TEMPORARY_DAYCARE,
                                    PlacementType.TEMPORARY_DAYCARE_PART_DAY ->
                                        toTemporaryPlacementInvoiceRows(
                                            config,
                                            childInput,
                                            period,
                                            rowInput,
                                        )
                                    else ->
                                        toPermanentPlacementInvoiceRows(
                                            invoiceRowSum,
                                            childInput,
                                            period,
                                            rowInput,
                                        )
                                }
                            invoiceRowSum += rows.sumOf { it.price }
                            invoiceRows += rows
                        }
                    invoiceRows
                }
                .let { rows ->
                    applyRoundingRows(rows, headInput.decisions, invoiceInput.invoicePeriod)
                }
                .filter { row -> row.price != 0 }

        if (rows.isEmpty()) return null

        val areaId =
            rowInputsByChild
                .maxByOrNull { (child, _) -> child.dateOfBirth }!!
                .let { (_, rowInputs) ->
                    val (_, rowInput) = rowInputs.first()
                    invoiceInput.areaIds[rowInput.placementUnitId]
                        ?: error("Couldn't find areaId for daycare (${rowInput.placementUnitId})")
                }

        return DraftInvoice(
                periodStart = invoiceInput.invoicePeriod.start,
                periodEnd = invoiceInput.invoicePeriod.end,
                areaId = areaId,
                headOfFamily = headInput.headOfFamily,
                codebtor = headInput.codebtor,
                rows = rows,
            )
            .takeIf { it.totalPrice >= invoiceInput.minimumInvoiceAmount }
    }

    private fun calculateDailyPriceForInvoiceRow(price: Int, dailyFeeDivisor: Int): Int =
        BigDecimal(price).divide(BigDecimal(dailyFeeDivisor), 0, RoundingMode.HALF_UP).toInt()

    private fun toTemporaryPlacementInvoiceRows(
        config: InvoiceGeneratorConfig,
        childInput: ChildInput,
        period: FiniteDateRange,
        rowInput: RowInput,
    ): List<DraftInvoiceRow> {
        val refundAbsenceDates =
            rowInput.placementType != PlacementType.TEMPORARY_DAYCARE_PART_DAY ||
                config.temporaryDaycarePartDayAbsenceGivesADailyRefund

        val amount =
            childInput.attendanceDates
                .take(childInput.dailyFeeDivisor)
                .filter { date -> period.includes(date) }
                .filterNot { date -> refundAbsenceDates && childInput.hasAbsenceOnDate(date) }
                .size

        return if (amount == 0) {
            listOf()
        } else {
            listOf(
                DraftInvoiceRow(
                    periodStart = period.start,
                    periodEnd = period.end,
                    childId = rowInput.child.id,
                    amount = amount,
                    unitPrice = rowInput.priceBeforeFeeAlterations,
                    unitId = rowInput.placementUnitId,
                    product = productProvider.mapToProduct(rowInput.placementType),
                )
            )
        }
    }

    private fun toPermanentPlacementInvoiceRows(
        accumulatedSum: Int,
        childInput: ChildInput,
        period: FiniteDateRange,
        rowInput: RowInput,
    ): List<DraftInvoiceRow> {
        // Make sure the number of operational days in a month doesn't exceed `dailyFeeDivisor`.
        //
        // Example: A child has a placement to a round-the-clock unit for the first half and to a
        // normal unit for the second half of the month. The round-the-clock unit has more
        // operational
        // days, so we have to make sure that we don't invoice more than `dailyFeeDivisor` days.
        //
        val periodAttendanceDates =
            childInput.attendanceDates.take(childInput.dailyFeeDivisor).filter {
                period.includes(it)
            }
        if (periodAttendanceDates.isEmpty()) return listOf()

        val isFullMonth = periodAttendanceDates.size == childInput.numRelevantOperationalDays

        val product = productProvider.mapToProduct(rowInput.placementType)
        val (amount, unitPrice) =
            if (isFullMonth) {
                1 to { price: Int -> price }
            } else {
                periodAttendanceDates.size to
                    { price: Int ->
                        calculateDailyPriceForInvoiceRow(price, childInput.dailyFeeDivisor)
                    }
            }

        val initialRows =
            listOf(
                DraftInvoiceRow(
                    childId = rowInput.child.id,
                    periodStart = period.start,
                    periodEnd = period.end,
                    amount = amount,
                    unitPrice = unitPrice(rowInput.priceBeforeFeeAlterations),
                    unitId = rowInput.placementUnitId,
                    product = product,
                )
            ) +
                rowInput.feeAlterations.map { (feeAlterationType, feeAlterationEffect) ->
                    DraftInvoiceRow(
                        periodStart = period.start,
                        periodEnd = period.end,
                        childId = rowInput.child.id,
                        product =
                            productProvider.mapToFeeAlterationProduct(product, feeAlterationType),
                        unitId = rowInput.placementUnitId,
                        amount = amount,
                        unitPrice = unitPrice(feeAlterationEffect),
                    )
                }
        val totalAfterAlterations = initialRows.sumOf { it.price }

        val withDailyModifiers =
            initialRows +
                surplusContractDays(
                    config,
                    childInput,
                    period,
                    rowInput,
                    accumulatedSum + totalAfterAlterations,
                ) +
                dailyAbsenceRefund(
                    childInput,
                    period,
                    totalAfterAlterations,
                    periodAttendanceDates,
                    isFullMonth,
                ) { refundProduct, refundAmount, refundUnitPrice ->
                    DraftInvoiceRow(
                        childId = rowInput.child.id,
                        periodStart = period.start,
                        periodEnd = period.end,
                        amount = refundAmount,
                        unitPrice = refundUnitPrice,
                        unitId = rowInput.placementUnitId,
                        product = refundProduct,
                    )
                }
        val totalAfterModifiers = withDailyModifiers.sumOf { it.price }

        return withDailyModifiers +
            monthlyAbsenceDiscount(totalAfterModifiers, childInput.fullMonthAbsenceType) {
                absenceProduct,
                absenceDiscount ->
                DraftInvoiceRow(
                    childId = rowInput.child.id,
                    periodStart = period.start,
                    periodEnd = period.end,
                    product = absenceProduct,
                    unitId = rowInput.placementUnitId,
                    amount = amount,
                    unitPrice =
                        BigDecimal(absenceDiscount)
                            .divide(BigDecimal(amount), 0, RoundingMode.HALF_UP)
                            .toInt(),
                )
            }
    }

    private val plannedAbsenceTypes = setOf(AbsenceType.PLANNED_ABSENCE, AbsenceType.FREE_ABSENCE)
    private val unplannedAbsenceTypes = AbsenceType.entries.toSet() - plannedAbsenceTypes

    private fun surplusContractDays(
        config: InvoiceGeneratorConfig,
        childInput: ChildInput,
        period: FiniteDateRange,
        rowInput: RowInput,
        total: Int,
    ): List<DraftInvoiceRow> {
        if (childInput.contractDaysPerMonth == null) return listOf()

        val isAbsentFullMonth =
            setOf(
                    FullMonthAbsenceType.SICK_LEAVE_FULL_MONTH,
                    FullMonthAbsenceType.ABSENCE_FULL_MONTH,
                )
                .contains(childInput.fullMonthAbsenceType)
        if (isAbsentFullMonth) return listOf()

        val untilEndOfPeriod = FiniteDateRange(LocalDate.MIN, period.end)
        val attendances =
            childInput.attendanceDates
                .filter { untilEndOfPeriod.includes(it) && !childInput.hasAbsenceOnDate(it) }
                .size
        val unplannedAbsenceSurplusDays =
            if (config.unplannedAbsencesAreContractSurplusDays) {
                childInput.absenceCountInPeriod(untilEndOfPeriod, unplannedAbsenceTypes)
            } else {
                0
            }
        val attendanceDays = attendances + unplannedAbsenceSurplusDays

        return if (childInput.contractDaysPerMonth < attendanceDays) {
            val surplusAttendanceDays = attendanceDays - childInput.contractDaysPerMonth
            val surplusDailyPrice =
                calculateDailyPriceForInvoiceRow(
                    rowInput.finalPrice,
                    childInput.contractDaysPerMonth,
                )
            val totalAddition = surplusAttendanceDays * surplusDailyPrice

            val capMaxFeeAtDefault =
                listOf(PlacementType.PREPARATORY_DAYCARE, PlacementType.PRESCHOOL_DAYCARE)
                    .contains(rowInput.placementType)
            val maxPrice = childInput.getInvoiceMaxFee(capMaxFeeAtDefault)

            val (amount, unitPrice) =
                when {
                    // surplus days increase takes invoice row sum above max price threshold
                    total + totalAddition > maxPrice -> 1 to (maxPrice - total)
                    // total attendances days is over the max contract day surplus threshold
                    (config.maxContractDaySurplusThreshold ?: Int.MAX_VALUE) < attendanceDays ->
                        1 to (maxPrice - total)
                    else -> surplusAttendanceDays to surplusDailyPrice
                }
            // it is possible that the max fee is not over the already accumulated invoice total so
            // this prevents the surplus from being a 0 € row or a discount
            if (unitPrice > 0) {
                listOf(
                    DraftInvoiceRow(
                        periodStart = period.start,
                        periodEnd = period.end,
                        childId = rowInput.child.id,
                        product = productProvider.contractSurplusDay,
                        unitId = rowInput.placementUnitId,
                        amount = amount,
                        unitPrice = unitPrice,
                    )
                )
            } else {
                listOf()
            }
        } else {
            listOf()
        }
    }

    private fun dailyAbsenceRefund(
        childInput: ChildInput,
        period: FiniteDateRange,
        accumulatedSum: Int,
        periodAttendanceDates: List<LocalDate>,
        isFullMonth: Boolean,
        toInvoiceRow: (ProductKey, Int, Int) -> DraftInvoiceRow,
    ): List<DraftInvoiceRow> {
        assert(periodAttendanceDates.size <= childInput.dailyFeeDivisor)
        val forceMajeureDays = childInput.absenceCountInPeriod(period, dailyRefundAbsenceTypes)

        // Parental leave is allowed for the first two years, including the child's second birthday
        val parentalLeaveAllowedPeriod =
            FiniteDateRange(childInput.child.dateOfBirth, childInput.child.dateOfBirth.plusYears(2))
                .intersection(period)

        val parentalLeaveDays =
            if (parentalLeaveAllowedPeriod != null) {
                childInput.absenceCountInPeriod(parentalLeaveAllowedPeriod, parentLeaveAbsenceTypes)
            } else {
                0
            }

        val refundedDayCount = forceMajeureDays + parentalLeaveDays
        if (refundedDayCount == 0) return listOf()

        val (amount, unitPrice) =
            if (refundedDayCount >= childInput.numRelevantOperationalDays) {
                1 to -accumulatedSum
            } else {
                refundedDayCount to
                    -calculateDailyPriceForInvoiceRow(
                        accumulatedSum,
                        if (isFullMonth) childInput.dailyFeeDivisor else periodAttendanceDates.size,
                    )
            }

        return listOf(toInvoiceRow(productProvider.dailyRefund, amount, unitPrice))
    }

    private val dailyRefundAbsenceTypes =
        setOfNotNull(
            AbsenceType.FORCE_MAJEURE,
            if (featureConfig.freeAbsenceGivesADailyRefund) AbsenceType.FREE_ABSENCE else null,
        )

    private val parentLeaveAbsenceTypes = setOf(AbsenceType.PARENTLEAVE)

    private fun monthlyAbsenceDiscount(
        total: Int,
        fullMonthAbsenceType: FullMonthAbsenceType,
        toInvoiceRow: (ProductKey, Int) -> DraftInvoiceRow,
    ): List<DraftInvoiceRow> {
        if (total == 0) return listOf()

        val halfPrice = { price: Int ->
            BigDecimal(price).divide(BigDecimal(2), 0, RoundingMode.HALF_UP).toInt()
        }

        val (product, totalDiscount) =
            when (fullMonthAbsenceType) {
                FullMonthAbsenceType.SICK_LEAVE_FULL_MONTH ->
                    productProvider.fullMonthSickLeave to -total
                FullMonthAbsenceType.SICK_LEAVE_11 ->
                    productProvider.partMonthSickLeave to -halfPrice(total)
                FullMonthAbsenceType.ABSENCE_FULL_MONTH ->
                    productProvider.fullMonthAbsence to -halfPrice(total)
                FullMonthAbsenceType.NOTHING -> return listOf()
            }

        return listOf(toInvoiceRow(product, totalDiscount))
    }

    /*
    An extra invoice row is added for a child in case their invoice row sum is within 0.5€ of the monthly fee.
    These are typically used only when the child changes placement units and has for accounting reasons their monthly fee
    split into two invoice rows with daily prices. Daily prices are always rounded to whole cents so rounding mismatch
    is inevitable.

    A difference of 0.2€ is chosen because it's a bit over the maximum rounding error, which is 0.005€ * 31 (max amount of days in a month)
    */
    private fun applyRoundingRows(
        invoiceRows: List<DraftInvoiceRow>,
        feeDecisions: List<FeeDecision>,
        invoicePeriod: FiniteDateRange,
    ): List<DraftInvoiceRow> {
        return invoiceRows
            .groupBy { it.childId }
            .flatMap { (child, rows) ->
                val uniqueChildFees =
                    feeDecisions
                        .flatMap { it.children }
                        .filter { it.child.id == child }
                        .map { it.finalFee }
                        .distinct()

                val invoiceRowSum = rows.sumOf { it.price }

                val roundingRow =
                    if (uniqueChildFees.size == 1) {
                        val difference = uniqueChildFees.first() - invoiceRowSum

                        if (difference != 0 && -20 < difference && difference < 20) {
                            rows
                                .first()
                                .copy(
                                    periodStart = invoicePeriod.start,
                                    periodEnd = invoicePeriod.end,
                                    amount = 1,
                                    unitPrice = difference,
                                )
                        } else {
                            null
                        }
                    } else {
                        null
                    }

                if (roundingRow != null) rows + roundingRow else rows
            }
    }

    class InvoiceGeneratorInput(
        val decisions: Map<PersonId, List<FeeDecision>>,
        val permanentPlacements: Map<ChildId, List<Pair<FiniteDateRange, PlacementStub>>>,
        val temporaryPlacements: Map<PersonId, List<Pair<FiniteDateRange, PlacementStub>>>,
        val invoicePeriod: FiniteDateRange,
        val areaIds: Map<DaycareId, AreaId>,
        val operationalDaysByChild: Map<ChildId, DateSet>,
        val businessDays: DateSet,
        val feeThresholds: FeeThresholds,
        val absences: Map<ChildId, List<Pair<AbsenceType, DateSet>>>,
        val freeChildren: Set<ChildId>,
        val codebtors: Map<PersonId, PersonId?>,
        val defaultServiceNeedOptions: Map<PlacementType, ServiceNeedOption>,
        val minimumInvoiceAmount: Int, // cents
    ) {
        val businessDayCount = businessDays.ranges().map { it.durationInDays() }.sum().toInt()

        val decisionIds: Map<PersonId, List<FeeDecisionId>> by lazy {
            decisions.mapValues { (_, decisions) -> decisions.map { it.id } }
        }
    }

    class HeadOfFamilyInput(
        private val config: InvoiceGeneratorConfig,
        private val invoiceInput: InvoiceGeneratorInput,
        val headOfFamily: PersonId,
        val codebtor: PersonId?,
        val decisions: List<FeeDecision>,
        /** Relevant placements only (placements from fee decisions and temporary placements) */
        val placements: List<Pair<FiniteDateRange, PlacementStub>>,
    ) {
        val placementRangesByChild: Map<ChildId, DateSet> by lazy {
            placements
                .asSequence()
                .map { (period, placement) -> placement.child.id to period }
                .groupBy({ it.first }, { it.second })
                .mapValues { DateSet.of(it.value) }
        }

        // In cities that use contract days, it is not allowed to change service needs
        // during middle of the month, so picking `contractDaysPerMonth` from the first
        // row is safe.
        val contractDaysPerMonthByChild: Map<ChildId, Int?> by lazy {
            decisions
                .flatMap { it.children }
                .groupBy { it.child.id }
                .mapValues { (_, parts) -> parts.first().serviceNeed.contractDaysPerMonth }
        }

        fun getInvoiceMaxFee(childId: ChildId, capMaxFeeAtDefault: Boolean): Int {
            val childDecisions =
                decisions.mapNotNull { decision ->
                    val childDecisionPart = decision.children.find { it.child.id == childId }
                    val dateRange = invoiceInput.invoicePeriod.intersection(decision.validDuring)
                    if (dateRange != null && childDecisionPart != null) {
                        dateRange to childDecisionPart
                    } else {
                        null
                    }
                }

            val getDecisionPartMaxFee: (FeeDecisionChild) -> Int = { part ->
                val maxFeeBeforeFeeAlterations = calculateMaxFee(part.baseFee, part.siblingDiscount)
                part.feeAlterations.fold(maxFeeBeforeFeeAlterations) { currentFee, feeAlteration ->
                    currentFee +
                        feeAlterationEffect(
                            currentFee,
                            feeAlteration.type,
                            feeAlteration.amount,
                            feeAlteration.isAbsolute,
                        )
                }
            }
            val getDefaultMaxFee: (PlacementType, Int) -> Int = { placementType, discountedFee ->
                val feeCoefficient =
                    invoiceInput.defaultServiceNeedOptions[placementType]?.feeCoefficient
                        ?: throw Exception(
                            "No default service need option found for placement type $placementType"
                        )
                (feeCoefficient * BigDecimal(discountedFee)).toInt()
            }

            val childDecisionMaxFees =
                childDecisions.map { (dateRange, decisionPart) ->
                    val decisionPartMaxFee = getDecisionPartMaxFee(decisionPart)
                    dateRange to
                        minOf(
                            decisionPartMaxFee,
                            if (capMaxFeeAtDefault) {
                                getDefaultMaxFee(decisionPart.placement.type, decisionPartMaxFee)
                            } else Int.MAX_VALUE,
                        )
                }

            return if (config.useContractDaysAsDailyFeeDivisor) {
                childDecisionMaxFees.maxOf { (_, maxFee) -> maxFee }
            } else {
                childDecisionMaxFees
                    .map { (dateRange, maxFee) ->
                        val daysInRange =
                            invoiceInput.businessDays
                                .intersectRanges(dateRange)
                                .map { it.durationInDays() }
                                .sum()
                        (BigDecimal(maxFee) * BigDecimal(daysInRange)).divide(
                            BigDecimal(invoiceInput.businessDayCount),
                            2,
                            RoundingMode.HALF_UP,
                        )
                    }
                    .fold(BigDecimal.ZERO) { sum, maxFee -> sum + maxFee }
                    .toInt()
            }
        }
    }

    private data class RowInput(
        val child: ChildWithDateOfBirth,
        val placementUnitId: DaycareId,
        val placementType: PlacementType,
        val priceBeforeFeeAlterations: Int,
        val feeAlterations: List<Pair<FeeAlterationType, Int>>,
        val finalPrice: Int,
    ) {
        companion object {
            fun fromTemporaryPlacement(
                feeThresholds: FeeThresholds,
                child: ChildWithDateOfBirth,
                placement: PlacementStub,
                siblingOrdinal: Int,
            ): RowInput {
                val partDay = placement.type == PlacementType.TEMPORARY_DAYCARE_PART_DAY
                val fee = feeThresholds.calculatePriceForTemporary(partDay, siblingOrdinal)
                return RowInput(child, placement.unit, placement.type, fee, listOf(), fee)
            }

            fun fromFeeDecisionPart(part: FeeDecisionChild) =
                RowInput(
                    part.child,
                    part.placement.unitId,
                    part.placement.type,
                    part.fee,
                    part.feeAlterations.map { feeAlteration ->
                        Pair(feeAlteration.type, feeAlteration.effect)
                    },
                    part.finalFee,
                )
        }
    }

    class ChildInput(
        config: InvoiceGeneratorConfig,
        invoiceInput: InvoiceGeneratorInput,
        private val headInput: HeadOfFamilyInput,
        val child: ChildWithDateOfBirth,
    ) {
        private val operationalDays: DateSet =
            (invoiceInput.operationalDaysByChild[child.id] ?: DateSet.empty()).intersection(
                headInput.placementRangesByChild[child.id] ?: DateSet.empty()
            )
        private val absences: DateMap<AbsenceType> =
            (invoiceInput.absences[child.id] ?: emptyList()).fold(DateMap.empty()) {
                acc,
                (type, dates) ->
                acc.set(dates.intersection(operationalDays).ranges(), type)
            }

        private val isPartialMonthChild: Boolean by lazy {
            val businessDaysWithoutPlacement =
                invoiceInput.businessDays -
                    (headInput.placementRangesByChild[child.id] ?: DateSet.empty())
            businessDaysWithoutPlacement.isNotEmpty()
        }

        val contractDaysPerMonth = headInput.contractDaysPerMonthByChild[child.id]

        fun hasAbsenceOnDate(date: LocalDate): Boolean {
            return absences.getValue(date) != null
        }

        private fun hasAbsenceOnDate(date: LocalDate, type: AbsenceType): Boolean {
            return absences.getValue(date) == type
        }

        fun absenceCountInPeriod(period: FiniteDateRange, absenceTypes: Set<AbsenceType>): Int {
            return absences.entries().sumOf { (range, absenceType) ->
                if (absenceTypes.contains(absenceType)) {
                    range.intersection(period)?.durationInDays()?.toInt() ?: 0
                } else {
                    0
                }
            }
        }

        val attendanceDates: List<LocalDate> by lazy {
            if (config.useContractDaysAsDailyFeeDivisor && contractDaysPerMonth != null) {
                // Use real attendance dates (operational dates minus planned absences dates)
                val attendanceDates =
                    operationalDays
                        .ranges()
                        .flatMap { it.dates() }
                        .filterNot { date -> hasAbsenceOnDate(date, AbsenceType.PLANNED_ABSENCE) }
                        .toList()

                // If this is a full month for a contract day child, make sure that there's no less
                // than `contractDaysPerMonth` days even if they have more planned absences than
                // they should
                if (!isPartialMonthChild && attendanceDates.size < contractDaysPerMonth) {
                    val extraDatesToAdd = contractDaysPerMonth - attendanceDates.size
                    val operationalDaysWithoutAttendance =
                        (operationalDays - DateSet.ofDates(attendanceDates)).ranges().flatMap {
                            it.dates()
                        }
                    (attendanceDates + operationalDaysWithoutAttendance.take(extraDatesToAdd))
                        .sorted()
                } else {
                    attendanceDates
                }
            } else {
                // Take at most 5 days per week (for round-the-clock units)
                datesByWeekInPeriod(invoiceInput.invoicePeriod).flatMap { week ->
                    week.filter { operationalDays.includes(it) }.take(5)
                }
            }
        }

        val fullMonthAbsenceType: FullMonthAbsenceType by lazy {
            val operationalDays = operationalDays.ranges().flatMap { it.dates() }.toSet()

            val allSickLeaves =
                operationalDays.all { date -> hasAbsenceOnDate(date, AbsenceType.SICKLEAVE) }
            val atLeastOneSickLeave =
                operationalDays.any { date -> hasAbsenceOnDate(date, AbsenceType.SICKLEAVE) }
            val allSickLeavesOrPlannedAbsences =
                operationalDays.all { date ->
                    hasAbsenceOnDate(date, AbsenceType.SICKLEAVE) ||
                        hasAbsenceOnDate(date, AbsenceType.PLANNED_ABSENCE)
                }
            val atLeast11SickLeaves =
                operationalDays.count { date -> hasAbsenceOnDate(date, AbsenceType.SICKLEAVE) } >=
                    11
            val allAbsences = operationalDays.all { date -> hasAbsenceOnDate(date) }

            if (allSickLeaves) {
                FullMonthAbsenceType.SICK_LEAVE_FULL_MONTH
            } else if (
                config.freeSickLeaveOnContractDays &&
                    atLeastOneSickLeave &&
                    allSickLeavesOrPlannedAbsences
            ) { // freeSickLeaveOnContractDays: The month becomes free if it has at least one
                // sick leave, and a sick leave or planned absence on all days
                FullMonthAbsenceType.SICK_LEAVE_FULL_MONTH
            } else if (atLeast11SickLeaves) {
                FullMonthAbsenceType.SICK_LEAVE_11
            } else if (allAbsences) {
                FullMonthAbsenceType.ABSENCE_FULL_MONTH
            } else {
                FullMonthAbsenceType.NOTHING
            }
        }

        val dailyFeeDivisor =
            if (config.useContractDaysAsDailyFeeDivisor && contractDaysPerMonth != null) {
                contractDaysPerMonth
            } else if (config.dailyFeeDivisorOperationalDaysOverride != null) {
                config.dailyFeeDivisorOperationalDaysOverride
            } else {
                invoiceInput.businessDayCount
            }

        val numRelevantOperationalDays = minOf(dailyFeeDivisor, invoiceInput.businessDayCount)

        fun getInvoiceMaxFee(capMaxFeeAtDefault: Boolean): Int =
            headInput.getInvoiceMaxFee(child.id, capMaxFeeAtDefault)
    }
}

enum class FullMonthAbsenceType {
    SICK_LEAVE_FULL_MONTH,
    ABSENCE_FULL_MONTH,
    SICK_LEAVE_11,
    NOTHING,
}

private fun datesByWeekInPeriod(period: FiniteDateRange): List<List<LocalDate>> {
    return period.dates().fold<LocalDate, List<List<LocalDate>>>(listOf()) { weeks, date ->
        if (weeks.isEmpty() || date.dayOfWeek == DayOfWeek.MONDAY) {
            weeks.plusElement(listOf(date))
        } else {
            weeks.dropLast(1).plusElement(weeks.last() + date)
        }
    }
}
