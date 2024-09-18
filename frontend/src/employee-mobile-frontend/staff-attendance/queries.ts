// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { mutation, query } from 'lib-common/query'
import { Arg0, UUID } from 'lib-common/types'

import {
  getAttendancesByUnit,
  markArrival,
  markDeparture,
  markExternalArrival,
  markExternalDeparture,
  setAttendances
} from '../generated/api-clients/attendance'
import { createQueryKeys } from '../query'
import LocalDate from '../../lib-common/local-date'

const queryKeys = createQueryKeys('staffAttendance', {
  ofUnitDate: (unitId: UUID, date: LocalDate | null | undefined) => ['unit-date', unitId, date]
})

export const staffAttendanceQuery = query({
  api: getAttendancesByUnit,
  queryKey: ({ unitId, date }) => queryKeys.ofUnitDate(unitId, date)
})

export const staffArrivalMutation = mutation({
  api: (arg: Arg0<typeof markArrival> & { unitId: UUID }) => markArrival(arg),
  invalidateQueryKeys: ({ unitId }) => [
    staffAttendanceQuery({ unitId }).queryKey
  ]
})

export const staffDepartureMutation = mutation({
  api: (arg: Arg0<typeof markDeparture> & { unitId: UUID }) =>
    markDeparture(arg),
  invalidateQueryKeys: ({ unitId }) => [
    staffAttendanceQuery({ unitId }).queryKey
  ]
})

export const externalStaffArrivalMutation = mutation({
  api: (arg: Arg0<typeof markExternalArrival> & { unitId: UUID }) =>
    markExternalArrival(arg),
  invalidateQueryKeys: ({ unitId }) => [
    staffAttendanceQuery({ unitId }).queryKey
  ]
})

export const externalStaffDepartureMutation = mutation({
  api: (arg: Arg0<typeof markExternalDeparture> & { unitId: UUID }) =>
    markExternalDeparture(arg),
  invalidateQueryKeys: ({ unitId }) => [
    staffAttendanceQuery({ unitId }).queryKey
  ]
})

export const staffAttendanceMutation = mutation({
  api: setAttendances,
  invalidateQueryKeys: ({ unitId }) => [
    staffAttendanceQuery({ unitId }).queryKey
  ]
})
