// SPDX-FileCopyrightText: 2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { useCallback, useState, useEffect } from 'react'

import { featureFlags } from 'lib-customizations/citizen'

import { MonthlyTimeSummary } from './MonthlyHoursSummary'

export function useSummaryInfo(childSummaries: MonthlyTimeSummary[]) {
  const displayAlert = !!(
    featureFlags.timeUsageInfo &&
    childSummaries.some(
      ({ reservedMinutes, usedServiceMinutes, serviceNeedMinutes }) =>
        reservedMinutes > serviceNeedMinutes ||
        usedServiceMinutes > serviceNeedMinutes
    )
  )
  const [summaryExplicitlyClosed, setSummaryExplicitlyClosed] = useState(false)
  const [summaryInfoOpen, setSummaryInfoOpen] = useState(
    () =>
      featureFlags.timeUsageInfo &&
      childSummaries.some(
        ({ reservedMinutes, serviceNeedMinutes }) =>
          reservedMinutes > serviceNeedMinutes
      )
  )

  const toggleSummaryInfo = useCallback(() => {
    setSummaryInfoOpen((prev) => {
      const newState = !prev
      if (!newState) {
        setSummaryExplicitlyClosed(true)
      }
      return newState
    })
  }, [])

  useEffect(() => {
    if (
      featureFlags.timeUsageInfo &&
      !summaryExplicitlyClosed &&
      childSummaries.some(
        ({ reservedMinutes, serviceNeedMinutes }) =>
          reservedMinutes > serviceNeedMinutes
      )
    ) {
      setSummaryInfoOpen(true)
    }
  }, [childSummaries, summaryExplicitlyClosed])

  return { summaryInfoOpen, displayAlert, toggleSummaryInfo }
}
