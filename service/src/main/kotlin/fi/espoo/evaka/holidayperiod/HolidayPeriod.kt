// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.holidayperiod

import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.databind.annotation.JsonTypeIdResolver
import fi.espoo.evaka.shared.HolidayPeriodId
import fi.espoo.evaka.shared.config.SealedSubclassSimpleName
import fi.espoo.evaka.shared.domain.FiniteDateRange
import java.time.LocalDate

@JsonTypeInfo(use = JsonTypeInfo.Id.CUSTOM, property = "type")
@JsonTypeIdResolver(SealedSubclassSimpleName::class)
sealed interface HolidayPeriodEffect {
    /** Reservations cannot be made: the holiday period is not yet open for reservations */
    data class NotYetReservable(val period: FiniteDateRange, val reservationsOpenOn: LocalDate) :
        HolidayPeriodEffect

    /**
     * Reservations are open: Can make PRESENT/ABSENT reservations, i.e. reservations without time
     */
    data object ReservationsOpen : HolidayPeriodEffect

    /**
     * Deadline has passed: Reservations cannot be made, but PRESENT reservations can be changed to
     * reservations with time
     */
    data object ReservationsClosed : HolidayPeriodEffect
}

data class HolidayPeriod(
    val id: HolidayPeriodId,
    val period: FiniteDateRange,
    val reservationsOpenOn: LocalDate,
    val reservationDeadline: LocalDate
) {
    /**
     * Returns the effect of the holiday period for all dates inside `period`, when the *current*
     * date is `today`. Returns `null` if the holiday period doesn't have an effect.
     */
    fun effect(
        today: LocalDate,
        reservationEnabledPlacementRanges: List<FiniteDateRange>
    ): HolidayPeriodEffect? =
        when {
            reservationEnabledPlacementRanges.none {
                it.overlaps(FiniteDateRange(reservationsOpenOn, reservationDeadline))
            } -> null
            today < reservationsOpenOn ->
                HolidayPeriodEffect.NotYetReservable(period, reservationsOpenOn)
            today in reservationsOpenOn..reservationDeadline -> HolidayPeriodEffect.ReservationsOpen
            else -> HolidayPeriodEffect.ReservationsClosed
        }
}

data class HolidayPeriodBody(
    val period: FiniteDateRange,
    val reservationsOpenOn: LocalDate,
    val reservationDeadline: LocalDate
)
