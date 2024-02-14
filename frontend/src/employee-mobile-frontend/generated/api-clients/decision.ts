// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

// GENERATED FILE: no manual modifications
/* eslint-disable import/order, prettier/prettier, @typescript-eslint/no-namespace, @typescript-eslint/no-redundant-type-constituents */

import { DecisionListResponse } from 'lib-common/generated/api-types/decision'
import { DecisionUnit } from 'lib-common/generated/api-types/decision'
import { JsonOf } from 'lib-common/json'
import { UUID } from 'lib-common/types'
import { client } from '../../client'
import { deserializeJsonDecisionListResponse } from 'lib-common/generated/api-types/decision'
import { uri } from 'lib-common/uri'


/**
* Generated from fi.espoo.evaka.decision.DecisionController.getDecisionUnits
*/
export async function getDecisionUnits(): Promise<DecisionUnit[]> {
  const { data: json } = await client.request<JsonOf<DecisionUnit[]>>({
    url: uri`/decisions2/units`.toString(),
    method: 'GET'
  })
  return json
}


/**
* Generated from fi.espoo.evaka.decision.DecisionController.getDecisionsByApplication
*/
export async function getDecisionsByApplication(
  request: {
    id: UUID
  }
): Promise<DecisionListResponse> {
  const { data: json } = await client.request<JsonOf<DecisionListResponse>>({
    url: uri`/decisions2/by-application`.toString(),
    method: 'GET',
    params: {
      id: request.id
    }
  })
  return deserializeJsonDecisionListResponse(json)
}


/**
* Generated from fi.espoo.evaka.decision.DecisionController.getDecisionsByChild
*/
export async function getDecisionsByChild(
  request: {
    id: UUID
  }
): Promise<DecisionListResponse> {
  const { data: json } = await client.request<JsonOf<DecisionListResponse>>({
    url: uri`/decisions2/by-child`.toString(),
    method: 'GET',
    params: {
      id: request.id
    }
  })
  return deserializeJsonDecisionListResponse(json)
}


/**
* Generated from fi.espoo.evaka.decision.DecisionController.getDecisionsByGuardian
*/
export async function getDecisionsByGuardian(
  request: {
    id: UUID
  }
): Promise<DecisionListResponse> {
  const { data: json } = await client.request<JsonOf<DecisionListResponse>>({
    url: uri`/decisions2/by-guardian`.toString(),
    method: 'GET',
    params: {
      id: request.id
    }
  })
  return deserializeJsonDecisionListResponse(json)
}
