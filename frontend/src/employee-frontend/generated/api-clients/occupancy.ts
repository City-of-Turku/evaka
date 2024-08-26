// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

// GENERATED FILE: no manual modifications

import LocalDate from 'lib-common/local-date'
import { JsonOf } from 'lib-common/json'
import { OccupancyResponseSpeculated } from 'lib-common/generated/api-types/occupancy'
import { UUID } from 'lib-common/types'
import { UnitOccupancies } from 'lib-common/generated/api-types/occupancy'
import { client } from '../../api/client'
import { createUrlSearchParams } from 'lib-common/api'
import { deserializeJsonUnitOccupancies } from 'lib-common/generated/api-types/occupancy'
import { uri } from 'lib-common/uri'


/**
* Generated from fi.espoo.evaka.occupancy.OccupancyController.getOccupancyPeriodsSpeculated
*/
export async function getOccupancyPeriodsSpeculated(
  request: {
    unitId: UUID,
    applicationId: UUID,
    from: LocalDate,
    to: LocalDate,
    preschoolDaycareFrom?: LocalDate | null,
    preschoolDaycareTo?: LocalDate | null
  }
): Promise<OccupancyResponseSpeculated> {
  const params = createUrlSearchParams(
    ['from', request.from.formatIso()],
    ['to', request.to.formatIso()],
    ['preschoolDaycareFrom', request.preschoolDaycareFrom?.formatIso()],
    ['preschoolDaycareTo', request.preschoolDaycareTo?.formatIso()]
  )
  const { data: json } = await client.request<JsonOf<OccupancyResponseSpeculated>>({
    url: uri`/occupancy/by-unit/${request.unitId}/speculated/${request.applicationId}`.toString(),
    method: 'GET',
    params
  })
  return json
}


/**
* Generated from fi.espoo.evaka.occupancy.OccupancyController.getUnitOccupancies
*/
export async function getUnitOccupancies(
  request: {
    unitId: UUID,
    from: LocalDate,
    to: LocalDate,
    groupId?: UUID | null
  }
): Promise<UnitOccupancies> {
  const params = createUrlSearchParams(
    ['from', request.from.formatIso()],
    ['to', request.to.formatIso()],
    ['groupId', request.groupId]
  )
  const { data: json } = await client.request<JsonOf<UnitOccupancies>>({
    url: uri`/occupancy/units/${request.unitId}`.toString(),
    method: 'GET',
    params
  })
  return deserializeJsonUnitOccupancies(json)
}
