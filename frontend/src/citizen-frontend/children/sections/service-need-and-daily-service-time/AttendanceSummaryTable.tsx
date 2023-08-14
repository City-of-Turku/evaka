// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useMemo, useState } from 'react'
import styled from 'styled-components'

import { useTranslation } from 'citizen-frontend/localization'
import { Result, combine } from 'lib-common/api'
import FiniteDateRange from 'lib-common/finite-date-range'
import { AttendanceSummary } from 'lib-common/generated/api-types/children'
import { ServiceNeedSummary } from 'lib-common/generated/api-types/serviceneed'
import LocalDate from 'lib-common/local-date'
import { useQuery } from 'lib-common/query'
import { UUID } from 'lib-common/types'
import IconButton from 'lib-components/atoms/buttons/IconButton'
import ErrorSegment from 'lib-components/atoms/state/ErrorSegment'
import Spinner from 'lib-components/atoms/state/Spinner'
import ListGrid from 'lib-components/layout/ListGrid'
import { FixedSpaceRow } from 'lib-components/layout/flex-helpers'
import { AlertBox } from 'lib-components/molecules/MessageBoxes'
import { H3, Label } from 'lib-components/typography'
import colors from 'lib-customizations/common'
import { faChevronLeft, faChevronRight } from 'lib-icons'

import { attendanceSummaryQuery } from './queries'

interface AttendanceSummaryTableProps {
  childId: UUID
  serviceNeedsResponse: Result<ServiceNeedSummary[]>
}

export default React.memo(function AttendanceSummaryTable({
  childId,
  serviceNeedsResponse
}: AttendanceSummaryTableProps) {
  const t = useTranslation()
  const [attendanceSummaryDate, setAttendanceSummaryDate] = useState(() =>
    LocalDate.todayInHelsinkiTz().startOfMonth()
  )
  const attendanceSummaryRange = useMemo(
    () =>
      new FiniteDateRange(
        attendanceSummaryDate.startOfMonth(),
        attendanceSummaryDate.lastDayOfMonth()
      ),
    [attendanceSummaryDate]
  )
  const { data: attendanceSummaryResponse } = useQuery(
    attendanceSummaryQuery(childId, attendanceSummaryDate)
  )

  return (
    <>
      <ListGrid>
        <H3>{t.children.attendanceSummary.title}</H3>
        <FixedSpaceRow alignItems="center">
          <IconButton
            icon={faChevronLeft}
            onClick={() =>
              setAttendanceSummaryDate(attendanceSummaryDate.subMonths(1))
            }
            aria-label={t.calendar.previousMonth}
          />
          <div>{attendanceSummaryDate.formatExotic('MM / yyyy')}</div>
          <IconButton
            icon={faChevronRight}
            onClick={() =>
              setAttendanceSummaryDate(attendanceSummaryDate.addMonths(1))
            }
            aria-label={t.calendar.nextMonth}
          />
        </FixedSpaceRow>
      </ListGrid>
      {attendanceSummaryResponse !== undefined &&
        combine(serviceNeedsResponse, attendanceSummaryResponse).mapAll({
          failure: () => (
            <ErrorSegment title={t.common.errors.genericGetError} />
          ),
          loading: () => <Spinner />,
          success: ([serviceNeeds, attendanceSummary]) => (
            <AttendanceSummary
              serviceNeeds={serviceNeeds.filter(
                (sn) =>
                  attendanceSummaryRange.overlaps(
                    new FiniteDateRange(sn.startDate, sn.endDate)
                  ) && sn.contractDaysPerMonth !== null
              )}
              attendanceSummary={attendanceSummary}
            />
          )
        })}
    </>
  )
})

interface AttendanceSummaryProps {
  serviceNeeds: ServiceNeedSummary[]
  attendanceSummary: AttendanceSummary
}

const AttendanceSummary = ({
  serviceNeeds,
  attendanceSummary: { plannedDays, realizedDays }
}: AttendanceSummaryProps) => {
  const t = useTranslation()
  return (
    <>
      {serviceNeeds.length > 0 ? (
        serviceNeeds.map(({ startDate, contractDaysPerMonth }) => {
          const plannedWarning =
            contractDaysPerMonth !== null && plannedDays > contractDaysPerMonth
          const realizedWarning =
            contractDaysPerMonth !== null && realizedDays > contractDaysPerMonth
          return (
            <React.Fragment key={startDate.formatIso()}>
              <ListGrid>
                <Label>{t.children.attendanceSummary.planned}</Label>
                <span>
                  <Days warning={plannedWarning}>{plannedDays}</Days> /{' '}
                  {contractDaysPerMonth} {t.common.datetime.dayShort}
                </span>
                <Label>{t.children.attendanceSummary.realized}</Label>
                <span>
                  <Days warning={realizedWarning}>{realizedDays}</Days> /{' '}
                  {contractDaysPerMonth} {t.common.datetime.dayShort}
                </span>
              </ListGrid>
              {(plannedWarning || realizedWarning) && (
                <AlertBox message={t.children.attendanceSummary.warning} />
              )}
            </React.Fragment>
          )
        })
      ) : (
        <div>{t.children.attendanceSummary.empty}</div>
      )}
    </>
  )
}

const Days = styled.span<{ warning: boolean }>`
  ${(p) =>
    p.warning &&
    `
    color: ${colors.status.warning}
  `}
`
