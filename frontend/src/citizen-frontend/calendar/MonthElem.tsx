// SPDX-FileCopyrightText: 2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useCallback, useState } from 'react'
import styled, { css } from 'styled-components'

import { CitizenCalendarEvent } from 'lib-common/generated/api-types/calendarevent'
import {
  ReservationChild,
  ReservationResponseDay
} from 'lib-common/generated/api-types/reservations'
import LocalDate from 'lib-common/local-date'
import { formatPreferredName } from 'lib-common/names'
import {
  ExpandingInfoBox,
  InlineInfoButton
} from 'lib-components/molecules/ExpandingInfo'
import { fontWeights, H2, H3 } from 'lib-components/typography'
import { defaultMargins } from 'lib-components/white-space'
import { featureFlags } from 'lib-customizations/citizen'
import colors from 'lib-customizations/common'

import { useTranslation } from '../localization'

import DayElem from './DayElem'
import MonthlyHoursSummary, { MonthlyTimeSummary } from './MonthlyHoursSummary'
import { ChildImageData } from './RoundChildImages'

export function getSummaryForMonth(
  childData: ReservationChild[],
  year: number,
  month: number
): MonthlyTimeSummary[] {
  return childData.flatMap(({ monthSummaries, firstName, preferredName }) => {
    const summaryForMonth = monthSummaries?.find(
      (monthSummary) =>
        monthSummary.year === year && monthSummary.month === month
    )
    if (!summaryForMonth) {
      return []
    }
    return {
      name: formatPreferredName({
        firstName,
        preferredName
      }),
      ...summaryForMonth
    }
  })
}

interface MonthProps {
  calendarMonth: CalendarMonth
  selectDate: (date: LocalDate) => void
  dayIsReservable: (date: LocalDate) => boolean
  dayIsHolidayPeriod: (date: LocalDate) => boolean
  events: CitizenCalendarEvent[]
  childImages: ChildImageData[]
  childSummaries: MonthlyTimeSummary[]
}

export default React.memo(function MonthElem({
  calendarMonth,
  dayIsHolidayPeriod,
  selectDate,
  dayIsReservable,
  events,
  childImages,
  childSummaries
}: MonthProps) {
  const i18n = useTranslation()

  const [monthlySummaryInfoOpen, setMonthlySummaryInfoOpen] = useState(false)
  const onMonthlySummaryInfoClick = useCallback(
    () => setMonthlySummaryInfoOpen((prev) => !prev),
    []
  )
  const displaySummary = featureFlags.timeUsageInfo && childSummaries.length > 0
  return (
    <>
      <MonthSummaryContainer>
        <MonthTitle>
          {i18n.common.datetime.months[calendarMonth.monthNumber - 1]}
          {displaySummary && (
            <InlineInfoButton
              onClick={onMonthlySummaryInfoClick}
              aria-label={i18n.common.openExpandingInfo}
              margin="zero"
              data-qa={`mobile-monthly-summary-info-button-${calendarMonth.monthNumber}-${calendarMonth.year}`}
              open={monthlySummaryInfoOpen}
            />
          )}
        </MonthTitle>
        {monthlySummaryInfoOpen && (
          <MonthlySummaryInfoBox
            info={
              <MonthlyHoursSummary
                year={calendarMonth.year}
                month={calendarMonth.monthNumber}
                childSummaries={childSummaries}
              />
            }
            data-qa={`mobile-monthly-summary-info-container-${calendarMonth.monthNumber}-${calendarMonth.year}`}
            close={() => setMonthlySummaryInfoOpen(false)}
          />
        )}
      </MonthSummaryContainer>
      {calendarMonth.calendarDays.map((day) => (
        <div key={day.date.formatIso()}>
          {day.date.getIsoDayOfWeek() === 1 && (
            <WeekTitle>
              {i18n.common.datetime.week} {day.date.getIsoWeek()}
            </WeekTitle>
          )}
          <DayElem
            calendarDay={day}
            selectDate={selectDate}
            isReservable={dayIsReservable(day.date)}
            isHolidayPeriod={dayIsHolidayPeriod(day.date)}
            childImages={childImages}
            events={events}
          />
        </div>
      ))}
    </>
  )
})

export interface CalendarMonth {
  year: number
  monthNumber: number
  calendarDays: ReservationResponseDay[]
}

export function groupByMonth(days: ReservationResponseDay[]): CalendarMonth[] {
  return days.reduce((months, day) => {
    const monthIndex = months.findIndex(
      (m) => m.monthNumber === day.date.month && m.year === day.date.year
    )

    if (monthIndex === -1) {
      // Month does not exist, create new month
      const newMonth = {
        year: day.date.year,
        monthNumber: day.date.month,
        calendarDays: [day]
      }
      return [...months, newMonth]
    } else {
      // Month exists, add day to the month
      return months.map((month, index) =>
        index === monthIndex
          ? { ...month, calendarDays: [...month.calendarDays, day] }
          : month
      )
    }
  }, [] as CalendarMonth[])
}
const titleStyles = css`
  margin: 0;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  background-color: ${(p) => p.theme.colors.main.m4};
  color: ${(p) => p.theme.colors.grayscale.g100};
  font-family: 'Open Sans', 'Arial', sans-serif;
  font-weight: ${fontWeights.semibold};
`
const MonthTitle = styled(H2)`
  font-size: 1.25em;
  padding: 0 ${defaultMargins.s} 0 0;
  ${titleStyles};
`
const WeekTitle = styled(H3)`
  padding: ${defaultMargins.s};
  border-bottom: 1px solid ${colors.grayscale.g15};
  ${titleStyles};
`
const MonthSummaryContainer = styled.div`
  position: sticky;
  top: 54px;
  z-index: 1;

  padding: ${defaultMargins.s};
  background-color: ${(p) => p.theme.colors.main.m4};
  border-top: 6px solid ${colors.main.m3};
  color: ${(p) => p.theme.colors.grayscale.g100};
  font-family: 'Open Sans', 'Arial', sans-serif;
`

const MonthlySummaryInfoBox = styled(ExpandingInfoBox)`
  margin-top: 0;
  margin-bottom: 0;
  max-height: 400px;
  overflow-y: auto;

  section {
    padding-bottom: 0;
  }
`
