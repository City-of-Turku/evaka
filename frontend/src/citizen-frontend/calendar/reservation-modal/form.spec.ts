// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import FiniteDateRange from 'lib-common/finite-date-range'
import {
  AbsenceInfo,
  Reservation,
  ReservationResponseDay,
  ReservationResponseDayChild
} from 'lib-common/generated/api-types/reservations'
import LocalDate from 'lib-common/local-date'
import LocalTime from 'lib-common/local-time'

import { DayProperties, resetTimes } from './form'

const monday = LocalDate.of(2021, 2, 1)
const tuesday = monday.addDays(1)
const wednesday = monday.addDays(2)
const sunday = monday.addDays(6)
const thursdayLastWeek = monday.subDays(4)
const tuesdayNextWeek = sunday.addDays(2)
const fridayNextWeek = sunday.addDays(5)

// mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
const selectedRange = new FiniteDateRange(monday, tuesdayNextWeek)

// mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
//          [] [] [] [] | [] [] [] [] [] [] [] | [] [] [] [] []
const emptyCalendarDaysIncludingWeekend: ReservationResponseDay[] = [
  ...new FiniteDateRange(thursdayLastWeek, fridayNextWeek).dates()
].map((date) => ({
  date,
  holiday: false,
  children: []
}))

// mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
//          [] []       | [] [] [] [] []       | [] [] [] [] []
const emptyCalendarDays = emptyCalendarDaysIncludingWeekend.filter(
  (day) => !day.date.isWeekend()
)

const emptyChild: ReservationResponseDayChild = {
  childId: 'child-1',
  requiresReservation: true,
  contractDays: false,
  shiftCare: false,
  absence: null,
  reservations: [],
  attendances: []
}

describe('resetTimes', () => {
  describe('DAILY', () => {
    it('No reservable days', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          [] []       | [] [] [] [] []       | [] [] [] [] []
      const dayProperties = new DayProperties(emptyCalendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: undefined,
          day: {
            branch: 'readOnly',
            state: 'noChildren'
          }
        }
      })
    })

    it('One reservable day', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          [] []       | [] _  [] [] []       | [] [] [] [] []
      const calendarDays = [...emptyCalendarDays]
      calendarDays[3] = {
        date: tuesday,
        holiday: false,
        children: [emptyChild]
      }

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [2, 2],
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }
      })
    })

    it('All weekdays are reservable', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [emptyChild]
        })
      )

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }
      })
    })

    it('All days are reservable', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _  _  _  | _  _  _  _  _  _  _  | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] =
        emptyCalendarDaysIncludingWeekend.map((day) => ({
          ...day,
          children: [emptyChild]
        }))

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 7],
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }
      })
    })

    it('Common reservations for some children', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          r  r        | r  r  r  r  r        | r  r  r  r  r
      //          r  r        | r  r  r  r  r        | r  r  r  r  r
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [
                {
                  type: 'TIMES',
                  startTime: LocalTime.of(8, 0),
                  endTime: LocalTime.of(16, 0)
                }
              ]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              reservations: [
                {
                  type: 'TIMES',
                  startTime: LocalTime.of(8, 0),
                  endTime: LocalTime.of(16, 0)
                }
              ]
            },
            { ...emptyChild, childId: 'child-3' }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, [])

      // Common reservations for child-1 and child-2
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '08:00', endTime: '16:00' }]
            }
          }
        }
      })

      // No common reservations for all children
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2', 'child-3']
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }
      })
    })

    it('Reservations not required', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          n  n        | n  n  n  n  n        | n  n  n  n  n
      //          n  n        | n  n  n  n  n        | n  n  n  n  n
      //          n  n        | n  n  a  n  n        | n  n  a  n  n
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              requiresReservation: false
            },
            {
              ...emptyChild,
              childId: 'child-2',
              requiresReservation: false
            },
            {
              ...emptyChild,
              childId: 'child-3',
              requiresReservation: false,
              absence:
                day.date.getIsoDayOfWeek() === 3
                  ? {
                      type: 'OTHER_ABSENCE',
                      editable: true
                    }
                  : null
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, [])

      // Empty days for child-1 and child-2
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservationNoTimes',
            state: 'present'
          }
        }
      })

      // Empty days for child-1 and child-2, child 3 has a single absence
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2', 'child-3']
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservationNoTimes',
            state: 'notSet'
          }
        }
      })
    })

    it('Open holiday period covers the whole period', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [emptyChild]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservationNoTimes',
            state: 'notSet'
          }
        }
      })
    })

    it('Open holiday period covers part of the period => a normal reservation state', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H
      const holidayPeriods = [
        {
          period: new FiniteDateRange(
            selectedRange.start,
            selectedRange.end.addDays(-1)
          ),
          state: 'open' as const
        }
      ]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [emptyChild]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }
      })
    })

    it('Open holiday period + absences for all children', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: {
                type: 'OTHER_ABSENCE',
                editable: true
              }
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: {
                type: 'OTHER_ABSENCE',
                editable: true
              }
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservationNoTimes',
            state: 'absent'
          }
        }
      })
    })

    it('Open holiday period + absences for some children', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: {
                type: 'OTHER_ABSENCE',
                editable: true
              }
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: null
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservationNoTimes',
            state: 'notSet'
          }
        }
      })
    })

    it('Open holiday period + reservations for all children', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          r  r        | r  r  r  r  r        | r  r  r  r  r
      //          r  r        | r  r  r  r  r        | r  r  r  r  r
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [{ type: 'NO_TIMES' }]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              reservations: [{ type: 'NO_TIMES' }]
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservationNoTimes',
            state: 'present'
          }
        }
      })
    })

    it('Open holiday period + reservations for some children', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          r  r        | r  r  r  r  r        | r  r  r  r  r
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [{ type: 'NO_TIMES' }]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              reservations: []
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'DAILY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'dailyTimes',
        state: {
          weekDayRange: [1, 5],
          day: {
            branch: 'reservationNoTimes',
            state: 'notSet'
          }
        }
      })
    })
  })

  describe('WEEKLY', () => {
    it('No reservable days', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          [] []       | [] [] [] [] []       | [] [] [] [] []
      const dayProperties = new DayProperties(emptyCalendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: []
      })
    })

    it('One reservable day', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          [] []       | [] [] [] [] []       | [] [] [] [] []
      const calendarDays = [...emptyCalendarDays]
      calendarDays[3] = {
        date: tuesday,
        holiday: false,
        children: [emptyChild]
      }

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 2,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          }
        ]
      })
    })

    it('All weekdays are reservable', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [emptyChild]
        })
      )

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [1, 2, 3, 4, 5].map((weekDay) => ({
          weekDay,
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }))
      })
    })

    it('All days are reservable', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _  _  _  | _  _  _  _  _  _  _  | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] =
        emptyCalendarDaysIncludingWeekend.map((day) => ({
          ...day,
          children: [emptyChild]
        }))

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [1, 2, 3, 4, 5, 6, 7].map((weekDay) => ({
          weekDay,
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }))
      })
    })

    it('Common absences', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      //          _  _        | _  _  a  _  _        | _  _  a  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: { type: 'OTHER_ABSENCE', editable: true }
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: { type: 'OTHER_ABSENCE', editable: true }
            },
            {
              ...emptyChild,
              childId: 'child-3',
              absence:
                day.date.getIsoDayOfWeek() === 3
                  ? { type: 'OTHER_ABSENCE', editable: true }
                  : null
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, [])

      // Common absence for child-1 and child-2
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [1, 2, 3, 4, 5].map((weekDay) => ({
          weekDay,
          day: {
            branch: 'reservation',
            state: { branch: 'absent', state: true }
          }
        }))
      })

      // Common absence for child-1, child-2 and child-3 on one day
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2', 'child-3']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 3,
            day: {
              branch: 'reservation',
              state: { branch: 'absent', state: true } // this day has an absence for all children
            }
          },
          {
            weekDay: 4,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 5,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          }
        ]
      })
    })

    it('Common absences (marked by employee or free)', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      //          _  _        | _  _  a  _  _        | _  _  a  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: { type: 'OTHER_ABSENCE', editable: false }
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: { type: 'FREE_ABSENCE', editable: false }
            },
            {
              ...emptyChild,
              childId: 'child-3',
              absence:
                day.date.getIsoDayOfWeek() === 3
                  ? { type: 'OTHER_ABSENCE', editable: false }
                  : null
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, [])

      // Common absence for child-1 and child-2
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [1, 2, 3, 4, 5].map((weekDay) => ({
          weekDay,
          day: {
            branch: 'readOnly',
            state: 'absentNotEditable'
          }
        }))
      })

      // Common absence for child-1, child-2 and child-3 on one day
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2', 'child-3']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 3,
            day: {
              // this day has an employee-marked absence for all children
              branch: 'readOnly',
              state: 'absentNotEditable'
            }
          },
          {
            weekDay: 4,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 5,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          }
        ]
      })
    })

    it('Common reservations', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          r1 r1       | r1 r1 r1 r1 r1       | r1 r1 r1 r1 r1
      //          r1 r1       | r1 r1 r1 r1 r1       | r1 r1 r1 r1 r1
      //          r2 r2       | r2 r2 r1 r2 r2       | r2 r2 r1 r2 r2
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [
                {
                  type: 'TIMES',
                  startTime: LocalTime.of(8, day.date.getIsoDayOfWeek() * 5),
                  endTime: LocalTime.of(16, 0)
                }
              ]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              reservations: [
                {
                  type: 'TIMES',
                  startTime: LocalTime.of(8, day.date.getIsoDayOfWeek() * 5),
                  endTime: LocalTime.of(16, 0)
                }
              ]
            },
            {
              ...emptyChild,
              childId: 'child-3',
              reservations: [
                {
                  type: 'TIMES',
                  startTime: LocalTime.of(8, 15),
                  endTime: LocalTime.of(16, 0)
                }
              ]
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, [])

      // Common reservations for child-1 and child-2
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '08:05', endTime: '16:00' }]
              }
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '08:10', endTime: '16:00' }]
              }
            }
          },
          {
            weekDay: 3,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '08:15', endTime: '16:00' }]
              }
            }
          },
          {
            weekDay: 4,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '08:20', endTime: '16:00' }]
              }
            }
          },
          {
            weekDay: 5,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '08:25', endTime: '16:00' }]
              }
            }
          }
        ]
      })

      // Common reservations for child-1, child-2 and child-3 on one day
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2', 'child-3']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 3,
            day: {
              // This day has a common reservation for all children
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '08:15', endTime: '16:00' }]
              }
            }
          },
          {
            weekDay: 4,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 5,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          }
        ]
      })
    })

    it('Reservations not required', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          n  n        | n  n  n  a  n        | n  n  n  n  n
      //          n  n        | n  n  a  a  n        | n  n  a  n  n
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              requiresReservation: false,
              absence:
                day.date.getIsoDayOfWeek() === 4
                  ? { type: 'OTHER_ABSENCE', editable: true }
                  : null
            },
            {
              ...emptyChild,
              childId: 'child-2',
              requiresReservation: false,
              absence:
                day.date.getIsoDayOfWeek() === 3 ||
                day.date.getIsoDayOfWeek() === 4
                  ? { type: 'OTHER_ABSENCE', editable: true }
                  : null
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'reservationNoTimes',
              state: 'present'
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservationNoTimes',
              state: 'present'
            }
          },
          {
            weekDay: 3,
            // The other child has an absence on this day
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 4,
            // Both children have an absence on this day
            day: {
              branch: 'reservationNoTimes',
              state: 'absent'
            }
          },
          {
            weekDay: 5,
            day: {
              branch: 'reservationNoTimes',
              state: 'present'
            }
          }
        ]
      })
    })

    it('Holidays', () => {
      // MO TU WE
      //    s  s
      //       s
      const calendarDays: ReservationResponseDay[] = [
        {
          date: monday,
          holiday: true,
          children: [
            { ...emptyChild, childId: 'child-1', shiftCare: false },
            { ...emptyChild, childId: 'child-2', shiftCare: false }
          ]
        },
        {
          date: tuesday,
          holiday: true,
          children: [
            { ...emptyChild, childId: 'child-1', shiftCare: true },
            { ...emptyChild, childId: 'child-2', shiftCare: false }
          ]
        },
        {
          date: wednesday,
          holiday: true,
          children: [
            { ...emptyChild, childId: 'child-1', shiftCare: true },
            { ...emptyChild, childId: 'child-2', shiftCare: true }
          ]
        }
      ]

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange: new FiniteDateRange(monday, wednesday),
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'readOnly',
              state: 'holiday'
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            weekDay: 3,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          }
        ]
      })
    })

    it('Open holiday period covers the whole period', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({ ...day, children: [emptyChild] })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [1, 2, 3, 4, 5].map((weekDay) => ({
          weekDay,
          day: {
            branch: 'reservationNoTimes',
            state: 'notSet'
          }
        }))
      })
    })

    it('Open holiday period covers part of the period => a normal reservation state', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H
      const holidayPeriods = [
        {
          period: new FiniteDateRange(
            selectedRange.start,
            selectedRange.end.addDays(-1)
          ),
          state: 'open' as const
        }
      ]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({ ...day, children: [emptyChild] })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [1, 2, 3, 4, 5].map((weekDay) => ({
          weekDay,
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }))
      })
    })

    it('Open holiday period + common absences', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      //          _  _        | _  _  a  _  _        | _  _  a  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: { type: 'OTHER_ABSENCE', editable: true }
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: { type: 'OTHER_ABSENCE', editable: true }
            },
            {
              ...emptyChild,
              childId: 'child-3',
              absence:
                day.date.getIsoDayOfWeek() === 3
                  ? { type: 'OTHER_ABSENCE', editable: true }
                  : null
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      // Common absences for child-1 and child-2
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [1, 2, 3, 4, 5].map((weekDay) => ({
          weekDay,
          day: {
            branch: 'reservationNoTimes',
            state: 'absent'
          }
        }))
      })

      // Common absences for child-1, child-2 and child-3 on one day
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2', 'child-3']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 3,
            day: {
              // This day has an absence for all children
              branch: 'reservationNoTimes',
              state: 'absent'
            }
          },
          {
            weekDay: 4,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 5,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          }
        ]
      })
    })

    it('Open holiday period + common absences (marked by employee)', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      //          a  a        | a  a  a  a  a        | a  a  a  a  a
      //          _  _        | _  _  a  _  _        | _  _  a  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: { type: 'OTHER_ABSENCE', editable: false }
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: { type: 'OTHER_ABSENCE', editable: false }
            },
            {
              ...emptyChild,
              childId: 'child-3',
              absence:
                day.date.getIsoDayOfWeek() === 3
                  ? { type: 'OTHER_ABSENCE', editable: false }
                  : null
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      // Common absences for child-1 and child-2
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [1, 2, 3, 4, 5].map((weekDay) => ({
          weekDay,
          day: {
            branch: 'readOnly',
            state: 'absentNotEditable'
          }
        }))
      })

      // Common absences for child-1, child-2 and child-3 on one day
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2', 'child-3']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 3,
            day: {
              // This day has an employee-marked absence for all children
              branch: 'readOnly',
              state: 'absentNotEditable'
            }
          },
          {
            weekDay: 4,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 5,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          }
        ]
      })
    })

    it('Open holiday period + common reservations', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          r  r        | r  r  r  r  r        | r  r  r  r  r
      //          r  r        | r  r  r  r  r        | r  r  r  r  r
      //          _  _        | _  _  r  _  _        | _  _  r  _  _
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [{ type: 'NO_TIMES' }]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              reservations: [{ type: 'NO_TIMES' }]
            },
            {
              ...emptyChild,
              childId: 'child-3',
              reservations:
                day.date.getIsoDayOfWeek() === 3
                  ? [
                      {
                        type: 'TIMES',
                        startTime: LocalTime.of(8, 15),
                        endTime: LocalTime.of(16, 0)
                      }
                    ]
                  : []
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      // Common reservations for child-1 and child-2
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [1, 2, 3, 4, 5].map((weekDay) => ({
          weekDay,
          day: {
            branch: 'reservationNoTimes',
            state: 'present'
          }
        }))
      })

      // Common reservations for child-1, child-2 and child-3 on one day
      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2', 'child-3']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 3,
            // This day has a reservation for all children
            day: {
              branch: 'reservationNoTimes',
              state: 'present'
            }
          },
          {
            weekDay: 4,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 5,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          }
        ]
      })
    })

    it('Open holiday period + mixed requiresReservation', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          r  r        | _  _  a  r  r        | _  _  a  r  r
      //          n  n        | _  n  a  n  n        | n  n  a  n  n
      const calendarDays: ReservationResponseDay[] = emptyCalendarDays.map(
        (day) => ({
          ...day,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              requiresReservation: true,
              reservations:
                day.date.getIsoDayOfWeek() === 4
                  ? [{ type: 'NO_TIMES' }]
                  : day.date.getIsoDayOfWeek() === 5
                  ? [
                      {
                        type: 'TIMES',
                        startTime: LocalTime.of(8, 0),
                        endTime: LocalTime.of(16, 0)
                      }
                    ]
                  : [],
              absence:
                day.date.getIsoDayOfWeek() === 3
                  ? { type: 'OTHER_ABSENCE', editable: true }
                  : null
            },
            {
              ...emptyChild,
              childId: 'child-2',
              requiresReservation: false,
              absence:
                day.date.getIsoDayOfWeek() === 3
                  ? { type: 'OTHER_ABSENCE', editable: true }
                  : null
            }
          ]
        })
      )

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'WEEKLY',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'weeklyTimes',
        state: [
          {
            weekDay: 1,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 2,
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            weekDay: 3,
            day: {
              branch: 'reservationNoTimes',
              state: 'absent'
            }
          },
          {
            weekDay: 4,
            day: {
              branch: 'reservationNoTimes',
              state: 'present'
            }
          },
          {
            weekDay: 5,
            day: {
              branch: 'reservationNoTimes',
              state: 'present'
            }
          }
        ]
      })
    })
  })

  describe('IRREGULAR', () => {
    const selectedRangeWeekDays = [...selectedRange.dates()].filter(
      (date) => !date.isWeekend()
    )

    it('No reservable days', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          [] []       | [] [] [] [] []       | [] [] [] [] []
      const dayProperties = new DayProperties(emptyCalendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: selectedRangeWeekDays.map((date) => ({
          date,
          day: { branch: 'readOnly', state: 'noChildren' }
        }))
      })
    })

    it('One reservable day', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          [] []       | [] _  [] [] []       | [] [] [] [] []
      const calendarDays = [...emptyCalendarDays]
      calendarDays[3] = {
        date: tuesday,
        holiday: false,
        children: [emptyChild]
      }

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: selectedRangeWeekDays.map((date) => ({
          date,
          day: date.isEqual(tuesday)
            ? {
                branch: 'reservation',
                state: {
                  branch: 'timeRanges',
                  state: [{ startTime: '', endTime: '' }]
                }
              }
            : { branch: 'readOnly', state: 'noChildren' }
        }))
      })
    })

    it('All weekdays are reservable', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays = emptyCalendarDays.map((day) => ({
        ...day,
        children: [emptyChild]
      }))

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: selectedRangeWeekDays.map((date) => ({
          date,
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }))
      })
    })

    it('All days are reservable', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _  _  _  | _  _  _  _  _  _  _  | _  _  _  _  _
      const calendarDays = emptyCalendarDaysIncludingWeekend.map((day) => ({
        ...day,
        children: [emptyChild]
      }))

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: [...selectedRange.dates()].map((date) => ({
          date,
          day: {
            branch: 'reservation',
            state: {
              branch: 'timeRanges',
              state: [{ startTime: '', endTime: '' }]
            }
          }
        }))
      })
    })

    it('Reservations + absences + employee-marked absences', () => {
      const range = new FiniteDateRange(monday, fridayNextWeek)
      const rangeWeekDays = [...range.dates()].filter(
        (date) => !date.isWeekend()
      )

      const r: Reservation = {
        type: 'TIMES',
        startTime: LocalTime.of(8, 0),
        endTime: LocalTime.of(16, 0)
      }
      const ae: AbsenceInfo = { type: 'OTHER_ABSENCE', editable: true }
      const an: AbsenceInfo = { type: 'OTHER_ABSENCE', editable: false }
      // n = no reservation required
      // nae = n + ae

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU WE  TH  fr sa su
      //                      | r  r  r  ae ae       | an _  nae nae n
      //                      | r  _  ae ae _        | an an nae n   n
      const calendarDays: ReservationResponseDay[] = [
        {
          date: rangeWeekDays[0],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [r]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              reservations: [r]
            }
          ]
        },
        {
          date: rangeWeekDays[1],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [r]
            },
            {
              ...emptyChild,
              childId: 'child-2'
            }
          ]
        },
        {
          date: rangeWeekDays[2],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [r]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: ae
            }
          ]
        },
        {
          date: rangeWeekDays[3],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: ae
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: ae
            }
          ]
        },
        {
          date: rangeWeekDays[4],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: ae
            },
            {
              ...emptyChild,
              childId: 'child-2'
            }
          ]
        },
        {
          date: rangeWeekDays[5],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: an
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: an
            }
          ]
        },
        {
          date: rangeWeekDays[6],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1'
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: an
            }
          ]
        },
        {
          date: rangeWeekDays[7],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              requiresReservation: false,
              absence: ae
            },
            {
              ...emptyChild,
              childId: 'child-2',
              requiresReservation: false,
              absence: ae
            }
          ]
        },
        {
          date: rangeWeekDays[8],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              requiresReservation: false,
              absence: ae
            },
            {
              ...emptyChild,
              childId: 'child-2',
              requiresReservation: false
            }
          ]
        },
        {
          date: rangeWeekDays[9],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              requiresReservation: false
            },
            {
              ...emptyChild,
              childId: 'child-2',
              requiresReservation: false
            }
          ]
        }
      ]

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange: range,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: [
          {
            date: rangeWeekDays[0],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '08:00', endTime: '16:00' }]
              }
            }
          },
          {
            date: rangeWeekDays[1],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: rangeWeekDays[2],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: rangeWeekDays[3],
            day: {
              branch: 'reservation',
              state: { branch: 'absent', state: true }
            }
          },
          {
            date: rangeWeekDays[4],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: rangeWeekDays[5],
            day: { branch: 'readOnly', state: 'absentNotEditable' }
          },
          {
            date: rangeWeekDays[6],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: rangeWeekDays[7],
            day: {
              branch: 'reservationNoTimes',
              state: 'absent'
            }
          },
          {
            date: rangeWeekDays[8],
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            date: rangeWeekDays[9],
            day: {
              branch: 'reservationNoTimes',
              state: 'present'
            }
          }
        ]
      })
    })

    it('Holidays', () => {
      // MO TU WE
      //    s  s
      //       s

      // Children without shift care are excluded from the day's children array
      const calendarDays: ReservationResponseDay[] = [
        {
          date: monday,
          holiday: true,
          children: []
        },
        {
          date: tuesday,
          holiday: true,
          children: [{ ...emptyChild, childId: 'child-1', shiftCare: true }]
        },
        {
          date: wednesday,
          holiday: true,
          children: [
            { ...emptyChild, childId: 'child-1', shiftCare: true },
            { ...emptyChild, childId: 'child-2', shiftCare: true }
          ]
        }
      ]

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange: new FiniteDateRange(monday, wednesday),
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: [
          {
            date: monday,
            day: {
              branch: 'readOnly',
              state: 'holiday'
            }
          },
          {
            date: tuesday,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: wednesday,
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          }
        ]
      })
    })

    it('Open holiday period + all weekdays are reservable', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays = emptyCalendarDays.map((day) => ({
        ...day,
        children: [emptyChild]
      }))

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: selectedRangeWeekDays.map((date) => ({
          date,
          day: {
            branch: 'reservationNoTimes',
            state: 'notSet'
          }
        }))
      })
    })

    it('Open holiday period + reservations + absences + employee-marked absences', () => {
      const r: Reservation = { type: 'NO_TIMES' }
      const aa: AbsenceInfo = { type: 'OTHER_ABSENCE', editable: true }
      const ae: AbsenceInfo = { type: 'OTHER_ABSENCE', editable: false }

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr
      //                      | H  H  H  H  H  H  H  | H  H
      const holidayPeriods = [{ period: selectedRange, state: 'open' as const }]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | r  r  r  aa aa       | ae _
      //                      | r  _  aa aa _        | ae ae
      const calendarDays: ReservationResponseDay[] = [
        {
          date: selectedRangeWeekDays[0],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [r]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              reservations: [r]
            }
          ]
        },
        {
          date: selectedRangeWeekDays[1],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [r]
            },
            {
              ...emptyChild,
              childId: 'child-2'
            }
          ]
        },
        {
          date: selectedRangeWeekDays[2],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [r]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: aa
            }
          ]
        },
        {
          date: selectedRangeWeekDays[3],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: aa
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: aa
            }
          ]
        },
        {
          date: selectedRangeWeekDays[4],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: aa
            },
            {
              ...emptyChild,
              childId: 'child-2'
            }
          ]
        },
        {
          date: selectedRangeWeekDays[5],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: ae
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: ae
            }
          ]
        },
        {
          date: selectedRangeWeekDays[6],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1'
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: ae
            }
          ]
        }
      ]

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: [
          {
            date: selectedRangeWeekDays[0],
            day: {
              branch: 'reservationNoTimes',
              state: 'present'
            }
          },
          {
            date: selectedRangeWeekDays[1],
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            date: selectedRangeWeekDays[2],
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            date: selectedRangeWeekDays[3],
            day: {
              branch: 'reservationNoTimes',
              state: 'absent'
            }
          },
          {
            date: selectedRangeWeekDays[4],
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          },
          {
            date: selectedRangeWeekDays[5],
            day: {
              branch: 'readOnly',
              state: 'absentNotEditable'
            }
          },
          {
            date: selectedRangeWeekDays[6],
            day: {
              branch: 'reservationNoTimes',
              state: 'notSet'
            }
          }
        ]
      })
    })

    it('Closed holiday period + reservations + absences + employee-marked absences', () => {
      const r: Reservation = { type: 'NO_TIMES' }
      const aa: AbsenceInfo = { type: 'OTHER_ABSENCE', editable: true }
      const ae: AbsenceInfo = { type: 'OTHER_ABSENCE', editable: false }

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr
      //                      | h  h  h  h  h  h  h  | h  h
      const holidayPeriods = [
        { period: selectedRange, state: 'closed' as const }
      ]

      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //                      | r  _  r  aa aa       | ae _
      //                      | r  _  aa aa _        | ae ae
      const calendarDays: ReservationResponseDay[] = [
        {
          date: selectedRangeWeekDays[0],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [r]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              reservations: [r]
            }
          ]
        },
        {
          date: selectedRangeWeekDays[1],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1'
            },
            {
              ...emptyChild,
              childId: 'child-2'
            }
          ]
        },
        {
          date: selectedRangeWeekDays[2],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              reservations: [r]
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: aa
            }
          ]
        },
        {
          date: selectedRangeWeekDays[3],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: aa
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: aa
            }
          ]
        },
        {
          date: selectedRangeWeekDays[4],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: aa
            },
            {
              ...emptyChild,
              childId: 'child-2'
            }
          ]
        },
        {
          date: selectedRangeWeekDays[5],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1',
              absence: ae
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: ae
            }
          ]
        },
        {
          date: selectedRangeWeekDays[6],
          holiday: false,
          children: [
            {
              ...emptyChild,
              childId: 'child-1'
            },
            {
              ...emptyChild,
              childId: 'child-2',
              absence: ae
            }
          ]
        }
      ]

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange,
          selectedChildren: ['child-1', 'child-2']
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: [
          {
            date: selectedRangeWeekDays[0],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: selectedRangeWeekDays[1],
            day: {
              branch: 'readOnly',
              state: 'reservationClosed'
            }
          },
          {
            date: selectedRangeWeekDays[2],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: selectedRangeWeekDays[3],
            day: {
              branch: 'readOnly',
              state: 'reservationClosed'
            }
          },
          {
            date: selectedRangeWeekDays[4],
            day: {
              branch: 'readOnly',
              state: 'reservationClosed'
            }
          },
          {
            date: selectedRangeWeekDays[5],
            day: {
              branch: 'readOnly',
              state: 'absentNotEditable'
            }
          },
          {
            date: selectedRangeWeekDays[6],
            day: {
              branch: 'readOnly',
              state: 'reservationClosed'
            }
          }
        ]
      })
    })

    it('Closed holiday period + reservation not required + absences', () => {
      const aa: AbsenceInfo = { type: 'OTHER_ABSENCE', editable: true }
      const ae: AbsenceInfo = { type: 'OTHER_ABSENCE', editable: false }

      const selectedRange = new FiniteDateRange(monday, wednesday)

      // mo tu we th fr sa su | MO TU WE th fr sa su | mo tu we th fr
      //                      | h  h  h              |
      const holidayPeriods = [
        { period: selectedRange, state: 'closed' as const }
      ]

      // mo tu we th fr sa su | MO TU WE th fr sa su | mo tu we th fr sa su
      //                      | aa ae _              |
      const calendarDays: ReservationResponseDay[] = [
        {
          date: selectedRangeWeekDays[0],
          holiday: false,
          children: [
            {
              ...emptyChild,
              requiresReservation: false,
              absence: aa
            }
          ]
        },
        {
          date: selectedRangeWeekDays[1],
          holiday: false,
          children: [
            {
              ...emptyChild,
              requiresReservation: false,
              absence: ae
            }
          ]
        },
        {
          date: selectedRangeWeekDays[2],
          holiday: false,
          children: [
            {
              ...emptyChild,
              requiresReservation: false
            }
          ]
        }
      ]

      const dayProperties = new DayProperties(calendarDays, holidayPeriods)

      expect(
        resetTimes(dayProperties, undefined, {
          repetition: 'IRREGULAR',
          selectedRange,
          selectedChildren: [emptyChild.childId]
        })
      ).toEqual({
        branch: 'irregularTimes',
        state: [
          {
            date: selectedRangeWeekDays[0],
            day: {
              branch: 'readOnly',
              state: 'reservationClosed'
            }
          },
          {
            date: selectedRangeWeekDays[1],
            day: {
              branch: 'readOnly',
              state: 'absentNotEditable'
            }
          },
          {
            date: selectedRangeWeekDays[2],
            day: {
              branch: 'reservationNoTimes',
              state: 'present'
            }
          }
        ]
      })
    })

    it('Previous days in state are reused when children stay the same', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays = emptyCalendarDays.map((day) => ({
        ...day,
        children: [emptyChild]
      }))

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(
          dayProperties,
          {
            childrenChanged: false,
            times: {
              branch: 'irregularTimes',
              state: [
                {
                  date: selectedRangeWeekDays[1],
                  day: {
                    branch: 'reservation',
                    state: {
                      branch: 'timeRanges',
                      state: [{ startTime: '08:15', endTime: '13:45' }]
                    }
                  }
                }
              ]
            }
          },
          {
            repetition: 'IRREGULAR',
            selectedRange: new FiniteDateRange(
              selectedRangeWeekDays[0],
              selectedRangeWeekDays[2]
            ),
            selectedChildren: [emptyChild.childId]
          }
        )
      ).toEqual({
        branch: 'irregularTimes',
        state: [
          {
            date: selectedRangeWeekDays[0],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: selectedRangeWeekDays[1],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '08:15', endTime: '13:45' }]
              }
            }
          },
          {
            date: selectedRangeWeekDays[2],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          }
        ]
      })
    })

    it('Previous days in state are NOT reused when children change', () => {
      // mo tu we th fr sa su | MO TU WE TH FR SA SU | MO TU we th fr sa su
      //          _  _        | _  _  _  _  _        | _  _  _  _  _
      const calendarDays = emptyCalendarDays.map((day) => ({
        ...day,
        children: [emptyChild]
      }))

      const dayProperties = new DayProperties(calendarDays, [])

      expect(
        resetTimes(
          dayProperties,
          {
            childrenChanged: true,
            times: {
              branch: 'irregularTimes',
              state: [
                {
                  date: selectedRangeWeekDays[1],
                  day: {
                    branch: 'reservation',
                    state: {
                      branch: 'timeRanges',
                      state: [{ startTime: '08:15', endTime: '13:45' }]
                    }
                  }
                }
              ]
            }
          },
          {
            repetition: 'IRREGULAR',
            selectedRange: new FiniteDateRange(
              selectedRangeWeekDays[0],
              selectedRangeWeekDays[2]
            ),
            selectedChildren: [emptyChild.childId]
          }
        )
      ).toEqual({
        branch: 'irregularTimes',
        state: [
          {
            date: selectedRangeWeekDays[0],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: selectedRangeWeekDays[1],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          },
          {
            date: selectedRangeWeekDays[2],
            day: {
              branch: 'reservation',
              state: {
                branch: 'timeRanges',
                state: [{ startTime: '', endTime: '' }]
              }
            }
          }
        ]
      })
    })
  })
})
