// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

export type SearchOrder = 'ASC' | 'DESC'

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type NullableValues<T> = { [K in keyof T]: T[K] | null }
