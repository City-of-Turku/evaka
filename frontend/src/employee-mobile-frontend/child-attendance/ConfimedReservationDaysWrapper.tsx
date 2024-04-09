// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'

import { renderResult } from 'employee-mobile-frontend/async-rendering'
import { useQueryResult } from 'lib-common/query'

import { SelectedGroupId } from '../common/selected-group'

import ConfirmedDaysReservationList from './ConfirmedDaysReservationList'
import { confirmedDaysReservationsStatisticsQuery } from './queries'

export default React.memo(function ConfirmedReservationsDaysWrapper({
  selectedGroupId
}: {
  selectedGroupId: SelectedGroupId
}) {
  const statisticsResult = useQueryResult(
    confirmedDaysReservationsStatisticsQuery(selectedGroupId.unitId)
  )

  return (
    <>
      {renderResult(statisticsResult, (dayStatistics) => (
        <ConfirmedDaysReservationList
          dailyStatistics={dayStatistics}
          selectedGroupId={selectedGroupId}
        />
      ))}
    </>
  )
})
