// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { Failure, Result, Success } from 'lib-common/api'
import { ApplicationDecisions } from 'lib-common/generated/api-types/application'
import { JsonOf } from 'lib-common/json'
import LocalDate from 'lib-common/local-date'
import { UUID } from 'lib-common/types'
import { client } from '../api-client'
import {
  Decision,
  deserializeApplicationDecisions,
  deserializeDecision
} from './types'

export async function getDecisions(): Promise<Result<ApplicationDecisions[]>> {
  return client
    .get<JsonOf<ApplicationDecisions[]>>('/citizen/decisions')
    .then((res) => res.data.map(deserializeApplicationDecisions))
    .then((data) => Success.of(data))
    .catch((e) => Failure.fromError(e))
}

export async function getApplicationDecisions(
  applicationId: UUID
): Promise<Result<Decision[]>> {
  return client
    .get<JsonOf<Decision[]>>(`/citizen/applications/${applicationId}/decisions`)
    .then((res) => res.data.map(deserializeDecision))
    .then((data) => Success.of(data))
    .catch((e) => Failure.fromError(e))
}

export async function acceptDecision(
  applicationId: UUID,
  decisionId: UUID,
  requestedStartDate: LocalDate
): Promise<Result<void>> {
  return client
    .post<void>(
      `/citizen/applications/${applicationId}/actions/accept-decision`,
      {
        decisionId,
        requestedStartDate
      }
    )
    .then(() => Success.of(undefined))
    .catch((e) => Failure.fromError(e))
}

export async function rejectDecision(
  applicationId: UUID,
  decisionId: UUID
): Promise<Result<void>> {
  const body = { decisionId }
  return client
    .post<void>(
      `/citizen/applications/${applicationId}/actions/reject-decision`,
      body
    )
    .then(() => Success.of(undefined))
    .catch((e) => Failure.fromError(e))
}
