// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import {
  addBusinessDays,
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInYears,
  format,
  getISODay,
  isAfter,
  isBefore,
  isToday,
  isValid,
  isWeekend,
  lastDayOfMonth,
  setMonth,
  startOfToday,
  subDays,
  subMonths,
  subWeeks,
  subYears,
  differenceInDays,
  startOfWeek,
  getISOWeek
} from 'date-fns'

const isoPattern = /^([0-9]+)-([0-9]+)-([0-9]+)$/
const fiPattern = /^(\d{2})\.(\d{2})\.(\d{4})$/

export default class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly date: number
  ) {}
  getYear(): number {
    return this.year
  }
  getMonth(): number {
    return this.month
  }
  getDate(): number {
    return this.date
  }
  getIsoDayOfWeek(): number {
    return getISODay(this.toSystemTzDate())
  }
  getIsoWeek(): number {
    return getISOWeek(this.toSystemTzDate())
  }
  withYear(year: number): LocalDate {
    return LocalDate.of(year, this.month, this.date)
  }
  withMonth(month: number): LocalDate {
    return LocalDate.fromSystemTzDate(
      setMonth(this.toSystemTzDate(), month - 1)
    )
  }
  withDate(date: number): LocalDate {
    return LocalDate.of(this.year, this.month, date)
  }
  addYears(years: number): LocalDate {
    return LocalDate.fromSystemTzDate(addYears(this.toSystemTzDate(), years))
  }
  addMonths(months: number): LocalDate {
    return LocalDate.fromSystemTzDate(addMonths(this.toSystemTzDate(), months))
  }
  addWeeks(weeks: number): LocalDate {
    return LocalDate.fromSystemTzDate(addWeeks(this.toSystemTzDate(), weeks))
  }
  addDays(days: number): LocalDate {
    return LocalDate.fromSystemTzDate(addDays(this.toSystemTzDate(), days))
  }
  addBusinessDays(days: number): LocalDate {
    return LocalDate.fromSystemTzDate(
      addBusinessDays(this.toSystemTzDate(), days)
    )
  }
  subYears(years: number): LocalDate {
    return LocalDate.fromSystemTzDate(subYears(this.toSystemTzDate(), years))
  }
  subMonths(months: number): LocalDate {
    return LocalDate.fromSystemTzDate(subMonths(this.toSystemTzDate(), months))
  }
  subWeeks(weeks: number): LocalDate {
    return LocalDate.fromSystemTzDate(subWeeks(this.toSystemTzDate(), weeks))
  }
  subDays(days: number): LocalDate {
    return LocalDate.fromSystemTzDate(subDays(this.toSystemTzDate(), days))
  }
  startOfWeek(): LocalDate {
    return LocalDate.fromSystemTzDate(
      startOfWeek(this.toSystemTzDate(), { weekStartsOn: 1 })
    )
  }
  lastDayOfMonth(): LocalDate {
    return LocalDate.fromSystemTzDate(lastDayOfMonth(this.toSystemTzDate()))
  }
  isBefore(other: LocalDate): boolean {
    return isBefore(this.toSystemTzDate(), other.toSystemTzDate())
  }
  isEqualOrAfter(other: LocalDate): boolean {
    return this.isEqual(other) || this.isAfter(other)
  }
  isEqualOrBefore(other: LocalDate): boolean {
    return this.isEqual(other) || this.isBefore(other)
  }
  isEqual(other: LocalDate): boolean {
    return (
      this.year === other.year &&
      this.month === other.month &&
      this.date === other.date
    )
  }
  isAfter(other: LocalDate): boolean {
    return isAfter(this.toSystemTzDate(), other.toSystemTzDate())
  }
  isBetween(minInclusive: LocalDate, maxInclusive: LocalDate): boolean {
    return (
      this.isEqualOrAfter(minInclusive) && this.isEqualOrBefore(maxInclusive)
    )
  }
  isToday(): boolean {
    return isToday(this.toSystemTzDate())
  }
  isWeekend(): boolean {
    return isWeekend(this.toSystemTzDate())
  }
  differenceInYears(other: LocalDate): number {
    return differenceInYears(this.toSystemTzDate(), other.toSystemTzDate())
  }
  differenceInDays(other: LocalDate): number {
    return differenceInDays(this.toSystemTzDate(), other.toSystemTzDate())
  }
  /**
   * <a href="https://date-fns.org/docs/format">date-fns format()</a>
   */
  format(pattern = 'dd.MM.yyyy'): string {
    return format(this.toSystemTzDate(), pattern)
  }
  toString(): string {
    return this.formatIso()
  }
  formatIso(): string {
    const month = this.month.toString().padStart(2, '0')
    const date = this.date.toString().padStart(2, '0')
    return `${this.year}-${month}-${date}`
  }
  toJSON(): string {
    return this.formatIso()
  }
  toSystemTzDate(): Date {
    return new Date(`${this.formatIso()}T00:00`)
  }
  static today(): LocalDate {
    return LocalDate.fromSystemTzDate(startOfToday())
  }
  static fromSystemTzDate(date: Date): LocalDate {
    const result = LocalDate.tryFromDate(date)
    if (!result) {
      throw new RangeError('Invalid date')
    }
    return result
  }
  static parseFiOrThrow(value: string): LocalDate {
    const parts = fiPattern.exec(value)
    if (!parts) {
      throw new RangeError(`Invalid FI date ${value}`)
    }
    const date = LocalDate.tryCreate(
      Number(parts[3]),
      Number(parts[2]),
      Number(parts[1])
    )
    if (!date) {
      throw new RangeError(`Invalid date ${value}`)
    }
    return date
  }
  static parseFiOrNull(value: string): LocalDate | null {
    try {
      return this.parseFiOrThrow(value)
    } catch (e) {
      return null
    }
  }
  static parseIso(value: string): LocalDate {
    const result = LocalDate.tryParseIso(value)
    if (!result) {
      throw new RangeError(`Invalid ISO date ${value}`)
    }
    return result
  }
  static parseNullableIso(value: string | null): LocalDate | null {
    return value !== null ? LocalDate.parseIso(value) : null
  }
  static tryParseIso(value: string): LocalDate | undefined {
    const parts = isoPattern.exec(value)
    if (!parts) return undefined
    return LocalDate.tryCreate(
      Number(parts[1]),
      Number(parts[2]),
      Number(parts[3])
    )
  }
  static of(year: number, month: number, date: number): LocalDate {
    const result = LocalDate.tryCreate(year, month, date)
    if (!result) {
      throw new RangeError(`Invalid date ${year}-${month}-${date}`)
    }
    return result
  }

  /** Generate all dates in [start, end] */
  static range(start: LocalDate, end: LocalDate): LocalDate[] {
    const result: LocalDate[] = []
    for (
      let value = start;
      value.isEqualOrBefore(end);
      value = value.addDays(1)
    ) {
      result.push(value)
    }
    return result
  }

  private static tryCreate(
    year: number,
    month: number,
    date: number
  ): LocalDate | undefined {
    return isValid(new Date(year, month - 1, date))
      ? new LocalDate(year, month, date)
      : undefined
  }
  private static tryFromDate(date: Date): LocalDate | undefined {
    return isValid(date)
      ? new LocalDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
      : undefined
  }
}
