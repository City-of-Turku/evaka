// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import DateRange from './date-range'
import FiniteDateRange from './finite-date-range'
import LocalDate from './local-date'

export type JsonOf<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends Date
  ? string
  : T extends LocalDate
  ? string
  : T extends FiniteDateRange
  ? { start: JsonOf<LocalDate>; end: JsonOf<LocalDate> }
  : T extends DateRange
  ? { start: JsonOf<LocalDate>; end: JsonOf<LocalDate> | null }
  : T extends Map<string, infer U>
  ? { [key: string]: JsonOf<U> }
  : T extends Set<infer U>
  ? Array<JsonOf<U>>
  : T extends Array<infer U>
  ? Array<JsonOf<U>>
  : T extends object // eslint-disable-line @typescript-eslint/ban-types
  ? { [P in keyof T]: JsonOf<T[P]> }
  : never
