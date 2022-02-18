// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import DateRange from './date-range'
import LocalDate from './local-date'

describe('DateRange', () => {
  describe('with finite end', () => {
    it('can be parsed from JSON', () => {
      const value = DateRange.parseJson({
        start: '2020-01-20',
        end: '2020-01-21'
      })
      expect(value.start.isEqual(LocalDate.of(2020, 1, 20))).toBe(true)
      expect(value.end?.isEqual(LocalDate.of(2020, 1, 21))).toBe(true)
    })
    it('becomes a simple object with ISO string endpoints when JSONified', () => {
      const json = JSON.stringify({
        dateRange: new DateRange(
          LocalDate.of(2020, 2, 1),
          LocalDate.of(2020, 3, 1)
        )
      })
      expect(JSON.parse(json)).toStrictEqual({
        dateRange: {
          start: '2020-02-01',
          end: '2020-03-01'
        }
      })
    })
  })
  describe('with infinite end', () => {
    it('can be parsed from JSON', () => {
      const value = DateRange.parseJson({
        start: '2021-01-01',
        end: null
      })
      expect(value.start.isEqual(LocalDate.of(2021, 1, 1))).toBe(true)
      expect(value.end).toBeNull()
    })
    it('becomes a simple object with ISO string endpoints when JSONified', () => {
      const json = JSON.stringify({
        dateRange: new DateRange(LocalDate.of(2021, 1, 1), null)
      })
      expect(JSON.parse(json)).toStrictEqual({
        dateRange: {
          start: '2021-01-01',
          end: null
        }
      })
    })
  })
})
