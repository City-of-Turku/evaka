// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { QueryClient } from '@tanstack/react-query'

import { queryKeysNamespace } from 'lib-common/query'

export type QueryKeyPrefix =
  | 'common'
  | 'applications'
  | 'childInformation'
  | 'documentTemplates'
  | 'employees'
  | 'financeBasics'
  | 'holidayPeriods'
  | 'incomeStatements'
  | 'reports'
  | 'timeline'
  | 'unit'
  | 'personProfile'
  | 'calendarEvent'
  | 'messaging'
  | 'personDetails'
  | 'systemNotifications'
  | 'invoices'
  | 'placementTool'
  | 'feeDecisions'
  | 'voucherValueDecisions'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always'
    },
    mutations: {
      networkMode: 'always'
    }
  }
})
export { QueryClientProvider } from '@tanstack/react-query'

export const createQueryKeys = queryKeysNamespace<QueryKeyPrefix>()
