// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

// GENERATED FILE: no manual modifications
/* eslint-disable import/order, prettier/prettier, @typescript-eslint/no-namespace, @typescript-eslint/no-redundant-type-constituents */

import LocalDate from 'lib-common/local-date'
import { AbsenceRequest } from 'lib-common/generated/api-types/reservations'
import { DailyReservationRequest } from 'lib-common/generated/api-types/reservations'
import { JsonCompatible } from 'lib-common/json'
import { JsonOf } from 'lib-common/json'
import { ReservationsResponse } from 'lib-common/generated/api-types/reservations'
import { client } from '../../api-client'
import { deserializeJsonReservationsResponse } from 'lib-common/generated/api-types/reservations'
import { uri } from 'lib-common/uri'


/**
* Generated from fi.espoo.evaka.reservations.ReservationControllerCitizen.getReservations
*/
export async function getReservations(
  request: {
    from: LocalDate,
    to: LocalDate
  }
): Promise<ReservationsResponse> {
  const { data: json } = await client.request<JsonOf<ReservationsResponse>>({
    url: uri`/citizen/reservations`.toString(),
    method: 'GET',
    params: {
      from: request.from.formatIso(),
      to: request.to.formatIso()
    }
  })
  return deserializeJsonReservationsResponse(json)
}


/**
* Generated from fi.espoo.evaka.reservations.ReservationControllerCitizen.postAbsences
*/
export async function postAbsences(
  request: {
    body: AbsenceRequest
  }
): Promise<void> {
  const { data: json } = await client.request<JsonOf<void>>({
    url: uri`/citizen/absences`.toString(),
    method: 'POST',
    data: request.body satisfies JsonCompatible<AbsenceRequest>
  })
  return json
}


/**
* Generated from fi.espoo.evaka.reservations.ReservationControllerCitizen.postReservations
*/
export async function postReservations(
  request: {
    body: DailyReservationRequest[]
  }
): Promise<void> {
  const { data: json } = await client.request<JsonOf<void>>({
    url: uri`/citizen/reservations`.toString(),
    method: 'POST',
    data: request.body satisfies JsonCompatible<DailyReservationRequest[]>
  })
  return json
}
