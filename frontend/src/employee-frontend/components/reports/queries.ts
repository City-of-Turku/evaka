// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { mutation, query } from 'lib-common/query'
import { Arg0, UUID } from 'lib-common/types'

import { sendJamixOrders } from '../../generated/api-clients/jamix'
import {
  clearTitaniaErrors,
  getAssistanceNeedsAndActionsReport,
  getAssistanceNeedsAndActionsReportByChild,
  getAttendanceReservationReportByChild,
  getChildAttendanceReport,
  getCustomerFeesReport,
  getExceededServiceNeedReportRows,
  getExceededServiceNeedReportUnits,
  getFamilyContactsReport,
  getFuturePreschoolersReport,
  getFuturePreschoolersSourceUnitsReport,
  getFuturePreschoolersUnitsReport,
  getHolidayPeriodAttendanceReport,
  getIncompleteIncomeReport,
  getInvoiceReport,
  getMealReportByUnit,
  getMissingHeadOfFamilyReport,
  getNonSsnChildrenReportRows,
  getOccupancyGroupReport,
  getOccupancyUnitReport,
  getPermittedReports,
  getPlacementGuaranteeReport,
  getPlacementSketchingReport,
  getPreschoolAbsenceReport,
  getPreschoolApplicationReport,
  getServiceVoucherReportForAllUnits,
  getStartingPlacementsReport,
  getTitaniaErrorsReport,
  getUnitsReport,
  getVardaChildErrorsReport,
  getVardaUnitErrorsReport
} from '../../generated/api-clients/reports'
import { markChildForVardaReset } from '../../generated/api-clients/varda'
import { createQueryKeys } from '../../query'

import { OccupancyReportFilters } from './Occupancies'

const queryKeys = createQueryKeys('reports', {
  permittedReports: () => ['permittedReports'],
  assistanceNeedsAndActions: (
    filters: Arg0<typeof getAssistanceNeedsAndActionsReport>
  ) => ['assistanceNeedsAndActions', filters],
  assistanceNeedsAndActionsByChild: (
    filters: Arg0<typeof getAssistanceNeedsAndActionsReportByChild>
  ) => ['assistanceNeedsAndActionsByChild', filters],
  attendanceReservationByChild: (
    filters: Arg0<typeof getAttendanceReservationReportByChild>
  ) => ['attendanceReservationByUnitAndChild', filters],
  childAttendance: (filters: Arg0<typeof getChildAttendanceReport>) => [
    'childAttendance',
    filters
  ],
  customerFees: (filters: Arg0<typeof getCustomerFeesReport>) => [
    'customerFees',
    filters
  ],
  exceededServiceNeedsUnits: () => ['exceededServiceNeedsUnits'],
  exceededServiceNeedsRows: (params: {
    unitId: UUID
    year: number
    month: number
  }) => ['exceededServiceNeedsReportRows', params],
  familyContacts: (filters: Arg0<typeof getFamilyContactsReport>) => [
    'familyContacts',
    filters
  ],
  invoices: (filters: Arg0<typeof getInvoiceReport>) => ['invoices', filters],
  missingHeadOfFamily: (filters: Arg0<typeof getMissingHeadOfFamilyReport>) => [
    'missingHeadOfFamily',
    filters
  ],
  occupancies: (filters: OccupancyReportFilters) => ['occupancies', filters],
  placementGuarantee: (filters: Arg0<typeof getPlacementGuaranteeReport>) => [
    'placementGuarantee',
    filters
  ],
  placementSketching: (filters: Arg0<typeof getPlacementSketchingReport>) => [
    'placementSketching',
    filters
  ],
  voucherServiceProviders: (
    filters: Arg0<typeof getServiceVoucherReportForAllUnits>
  ) => ['voucherServiceProviders', filters],
  vardaChildErrors: () => ['vardaChildErrors'],
  vardaUnitErrors: () => ['vardaUnitErrors'],
  futurePreschoolers: () => ['futurePreschoolers'],
  futurePreschoolersUnits: () => ['futurePreschoolersUnits'],
  units: () => ['units'],
  mealReportByUnit: (filters: Arg0<typeof getMealReportByUnit>) => [
    'mealReportByUnit',
    filters
  ],
  preschoolAbsenceReport: (filters: Arg0<typeof getPreschoolAbsenceReport>) => [
    'preschoolAbsenceReport',
    filters
  ],
  preschoolApplicationReport: () => ['preschoolApplicationReport'],
  holidayPeriodAttendanceReport: (
    filters: Arg0<typeof getHolidayPeriodAttendanceReport>
  ) => ['holidayPeriodPresenceReport', filters],
  titaniaErrorsReport: () => ['titaniaErrors'],
  incompleteIncomeReport: () => ['incompleteIncomes'],
  startingPlacementsReport: (
    filters: Arg0<typeof getStartingPlacementsReport>
  ) => ['startingPlacementsReport', filters]
})

export const permittedReportsQuery = query({
  api: getPermittedReports,
  queryKey: queryKeys.permittedReports
})

export const assistanceNeedsAndActionsReportQuery = query({
  api: getAssistanceNeedsAndActionsReport,
  queryKey: queryKeys.assistanceNeedsAndActions
})

export const assistanceNeedsAndActionsReportByChildQuery = query({
  api: getAssistanceNeedsAndActionsReportByChild,
  queryKey: queryKeys.assistanceNeedsAndActionsByChild
})

export const attendanceReservationReportByChildQuery = query({
  api: getAttendanceReservationReportByChild,
  queryKey: queryKeys.attendanceReservationByChild
})

export const childAttendanceReportQuery = query({
  api: getChildAttendanceReport,
  queryKey: queryKeys.childAttendance
})

export const customerFeesReportQuery = query({
  api: getCustomerFeesReport,
  queryKey: queryKeys.customerFees
})

export const exceededServiceNeedReportUnitsQuery = query({
  api: getExceededServiceNeedReportUnits,
  queryKey: queryKeys.exceededServiceNeedsUnits
})

export const exceededServiceNeedsReportRowsQuery = query({
  api: getExceededServiceNeedReportRows,
  queryKey: queryKeys.exceededServiceNeedsRows
})

export const familyContactsReportQuery = query({
  api: getFamilyContactsReport,
  queryKey: queryKeys.familyContacts
})

export const invoicesReportQuery = query({
  api: getInvoiceReport,
  queryKey: queryKeys.invoices
})

export const missingHeadOfFamilyReportQuery = query({
  api: getMissingHeadOfFamilyReport,
  queryKey: queryKeys.missingHeadOfFamily
})

export const nonSsnChildrenReportQuery = query({
  api: getNonSsnChildrenReportRows,
  queryKey: () => []
})

export const occupanciesReportQuery = query({
  api: (filters: OccupancyReportFilters) =>
    filters.careAreaId === null
      ? Promise.resolve([])
      : filters.display === 'UNITS'
        ? getOccupancyUnitReport(filters)
        : getOccupancyGroupReport(filters),
  queryKey: queryKeys.occupancies
})

export const placementGuaranteeReportQuery = query({
  api: getPlacementGuaranteeReport,
  queryKey: queryKeys.placementGuarantee
})

export const placementSketchingQuery = query({
  api: getPlacementSketchingReport,
  queryKey: queryKeys.placementSketching
})

export const voucherServiceProvidersReportQuery = query({
  api: getServiceVoucherReportForAllUnits,
  queryKey: queryKeys.voucherServiceProviders
})

export const vardaChildErrorsQuery = query({
  api: getVardaChildErrorsReport,
  queryKey: queryKeys.vardaChildErrors
})

export const resetVardaChildMutation = mutation({
  api: markChildForVardaReset,
  invalidateQueryKeys: () => [queryKeys.vardaChildErrors()]
})

export const vardaUnitErrorsQuery = query({
  api: getVardaUnitErrorsReport,
  queryKey: queryKeys.vardaUnitErrors
})

export const futurePreschoolersQuery = query({
  api: getFuturePreschoolersReport,
  queryKey: queryKeys.futurePreschoolers
})

export const preschoolUnitsQuery = query({
  api: getFuturePreschoolersUnitsReport,
  queryKey: queryKeys.futurePreschoolersUnits
})

export const preschoolSourceUnitsQuery = query({
  api: getFuturePreschoolersSourceUnitsReport,
  queryKey: queryKeys.futurePreschoolersUnits
})

export const unitsReportQuery = query({
  api: getUnitsReport,
  queryKey: queryKeys.units
})

export const mealReportByUnitQuery = query({
  api: getMealReportByUnit,
  queryKey: queryKeys.mealReportByUnit
})

export const preschoolAbsenceReportQuery = query({
  api: getPreschoolAbsenceReport,
  queryKey: queryKeys.preschoolAbsenceReport
})

export const preschoolApplicationReportQuery = query({
  api: getPreschoolApplicationReport,
  queryKey: queryKeys.preschoolApplicationReport
})

export const holidayPeriodAttendanceReportQuery = query({
  api: getHolidayPeriodAttendanceReport,
  queryKey: queryKeys.holidayPeriodAttendanceReport
})

export const sendJamixOrdersMutation = mutation({
  api: sendJamixOrders,
  invalidateQueryKeys: () => []
})

export const titaniaErrorsReportQuery = query({
  api: getTitaniaErrorsReport,
  queryKey: queryKeys.titaniaErrorsReport
})

export const clearTitaniaErrorMutation = mutation({
  api: clearTitaniaErrors,
  invalidateQueryKeys: () => [queryKeys.titaniaErrorsReport()]
})

export const incompleteIncomeReportQuery = query({
  api: getIncompleteIncomeReport,
  queryKey: queryKeys.incompleteIncomeReport
})

export const startingPlacementsReportQuery = query({
  api: getStartingPlacementsReport,
  queryKey: queryKeys.startingPlacementsReport
})
