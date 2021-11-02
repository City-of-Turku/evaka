// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { Failure, Result, Success } from 'lib-common/api'
import { client } from './client'
import { JsonOf } from 'lib-common/json'

interface User {
  id: string
  name: string
  unitId?: string // only mobile devices have this
}

const adRoles = [
  'SERVICE_WORKER',
  'UNIT_SUPERVISOR',
  'STAFF',
  'FINANCE_ADMIN',
  'ADMIN',
  'DIRECTOR',
  'SPECIAL_EDUCATION_TEACHER'
] as const

type AdRole = typeof adRoles[number]

export interface AuthStatus {
  loggedIn: boolean
  user?: User
  roles?: AdRole[]
}

export async function getAuthStatus(): Promise<Result<AuthStatus>> {
  return client
    .get<JsonOf<AuthStatus>>('/auth/status')
    .then((res) => Success.of(res.data))
    .catch((e) => Failure.fromError(e))
}
