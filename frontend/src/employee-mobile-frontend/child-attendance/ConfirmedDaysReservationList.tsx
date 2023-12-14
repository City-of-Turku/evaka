// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useMemo } from 'react'

import { DayReservationStatisticsResult } from 'lib-common/generated/api-types/reservations'
import { ContentArea } from 'lib-components/layout/Container'

import { useSelectedGroup } from '../common/selected-group'

import DayList from './DayList'

interface Props {
  dailyStatistics: DayReservationStatisticsResult[]
}

export default React.memo(function ConfirmedDaysReservationList({
  dailyStatistics
}: Props) {
  const { selectedGroupId } = useSelectedGroup()

  const groupReservations = useMemo(
    () =>
      selectedGroupId.type === 'all'
        ? dailyStatistics
        : dailyStatistics.map((day) => ({
            ...day,
            groupStatistics: day.groupStatistics.filter(
              (i) => i.groupId === selectedGroupId.id
            )
          })),
    [selectedGroupId, dailyStatistics]
  )

  return (
    <>
      <ContentArea
        opaque={false}
        paddingVertical="zero"
        paddingHorizontal="zero"
      >
        <DayList reservationStatistics={groupReservations} />
      </ContentArea>
    </>
  )
})
