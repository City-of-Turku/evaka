// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import sortBy from 'lodash/sortBy'

import LocalDate from 'lib-common/local-date'
import { mutation, query } from 'lib-common/query'

import {
  addCalendarEventTimeReservation,
  deleteCalendarEventTimeReservation,
  getCitizenCalendarEvents
} from '../generated/api-clients/calendarevent'
import { getDailyServiceTimeNotifications } from '../generated/api-clients/dailyservicetimes'
import {
  answerFixedPeriodQuestionnaire, answerOpenRangeQuestionnaire,
  getActiveQuestionnaires,
  getHolidayPeriods
} from '../generated/api-clients/holidayperiod'
import { getExpiringIncome } from '../generated/api-clients/invoicing'
import {
  getReservations,
  postAbsences,
  postReservations
} from '../generated/api-clients/reservations'
import { createQueryKeys } from '../query'

export const queryKeys = createQueryKeys('calendar', {
  allReservations: () => ['reservations'],
  reservations: (from: LocalDate, to: LocalDate) => [
    'reservations',
    from.formatIso(),
    to.formatIso()
  ],
  allEvents: () => ['calendarEvents'],
  calendarEvents: (from: LocalDate, to: LocalDate) => [
    'calendarEvents',
    from.formatIso(),
    to.formatIso()
  ],
  dailyServiceTimeNotifications: () => ['dailyServiceTimeNotifications'],
  holidayPeriods: () => ['holidayPeriods'],
  activeQuestionnaires: () => ['activeQuestionnaires'],
  incomeExpirationDates: () => ['incomeExpirationDates']
})

export const reservationsQuery = query({
  api: getReservations,
  queryKey: ({ from, to }) => queryKeys.reservations(from, to)
})

export const calendarEventsQuery = query({
  api: getCitizenCalendarEvents,
  queryKey: ({ start, end }) => queryKeys.calendarEvents(start, end)
})

export const dailyServiceTimeNotificationsQuery = query({
  api: getDailyServiceTimeNotifications,
  queryKey: queryKeys.dailyServiceTimeNotifications
})

export const postReservationsMutation = mutation({
  api: postReservations,
  invalidateQueryKeys: () => [queryKeys.allReservations()]
})

export const postAbsencesMutation = mutation({
  api: postAbsences,
  invalidateQueryKeys: () => [queryKeys.allReservations()]
})

export const addCalendarEventTimeReservationMutation = mutation({
  api: addCalendarEventTimeReservation,
  invalidateQueryKeys: () => [queryKeys.allEvents()]
})

export const deleteCalendarEventTimeReservationMutation = mutation({
  api: deleteCalendarEventTimeReservation,
  invalidateQueryKeys: () => [queryKeys.allEvents()]
})

export const holidayPeriodsQuery = query({
  api: getHolidayPeriods,
  queryKey: queryKeys.holidayPeriods
})

export const activeQuestionnaireQuery = query({
  api: () =>
    getActiveQuestionnaires().then((questionnaires) =>
      questionnaires.length > 0 ? questionnaires[0] : null
    ),
  queryKey: queryKeys.activeQuestionnaires
})

export const answerFixedPeriodQuestionnaireMutation = mutation({
  api: answerFixedPeriodQuestionnaire,
  invalidateQueryKeys: () => [
    activeQuestionnaireQuery().queryKey,
    queryKeys.allReservations()
  ]
})

export const answerOpenRangesQuestionnaireMutation = mutation({
  api: answerOpenRangeQuestionnaire,
  invalidateQueryKeys: () => [
    activeQuestionnaireQuery().queryKey,
    queryKeys.allReservations()
  ]
})

export const incomeExpirationDatesQuery = query({
  api: () =>
    getExpiringIncome().then((incomeExpirationDates) =>
      incomeExpirationDates.length > 0
        ? sortBy(incomeExpirationDates, (d) => d)[0]
        : null
    ),
  queryKey: queryKeys.incomeExpirationDates
})
