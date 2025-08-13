// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import type { UUID } from './service-client.js'
import { client } from './service-client.js'

export async function getCitizens(): Promise<DevCitizen[]> {
  const { data } = await client.get<DevCitizen[]>(`/dev-api/citizen`)
  return data
}

export interface DevCitizen {
  ssn: string
  firstName: string
  lastName: string
  dependantCount: number
}

interface Employee {
  id: UUID
  firstName: string
  lastName: string
  email: string | null
  externalId: string | null
}

export async function getEmployees(): Promise<Employee[]> {
  const { data } = await client.get<Employee[]>(`/dev-api/employee`)
  return data
}

export async function getVtjPersons(): Promise<VtjPersonSummary[]> {
  const { data } = await client.get<VtjPersonSummary[]>(`/dev-api/vtj-person`)
  return data
}

export interface VtjPersonSummary {
  ssn: string
  firstName: string
  lastName: string
}
