// SPDX-FileCopyrightText: 2017-2025 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

// GENERATED FILE: no manual modifications

import { JsonOf } from 'lib-common/json'
import { NekkuMealType } from 'lib-common/generated/api-types/nekku'
import { NekkuUnitNumber } from 'lib-common/generated/api-types/nekku'
import { client } from '../../api/client'
import { uri } from 'lib-common/uri'


/**
* Generated from fi.espoo.evaka.nekku.NekkuController.getNekkuMealTypes
*/
export async function getNekkuMealTypes(): Promise<NekkuMealType[]> {
  const { data: json } = await client.request<JsonOf<NekkuMealType[]>>({
    url: uri`/employee/nekku/meal-types`.toString(),
    method: 'GET'
  })
  return json
}


/**
* Generated from fi.espoo.evaka.nekku.NekkuController.getNekkuUnitNumbers
*/
export async function getNekkuUnitNumbers(): Promise<NekkuUnitNumber[]> {
  const { data: json } = await client.request<JsonOf<NekkuUnitNumber[]>>({
    url: uri`/employee/nekku/unit-numbers`.toString(),
    method: 'GET'
  })
  return json
}
