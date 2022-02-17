// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import FiniteDateRange from 'lib-common/finite-date-range'
import { PlacementType } from 'lib-common/generated/api-types/placement'
import LocalDate from 'lib-common/local-date'
import { UUID } from 'lib-common/types'
import { Unit } from '../api/daycare'

interface Child {
  id: UUID
  firstName: string
  lastName: string
  dob: LocalDate
}

export interface PlacementDraft {
  child: Child
  preferredUnits: Unit[]
  type: PlacementType
  period: FiniteDateRange
  preschoolDaycarePeriod?: FiniteDateRange
  placements: PlacementDraftPlacement[]
  guardianHasRestrictedDetails: boolean
}

export interface DaycarePlacementPlan {
  unitId?: UUID
  period?: FiniteDateRange
  preschoolDaycarePeriod?: FiniteDateRange
}

export interface PlacementDraftPlacement {
  id: UUID
  type: PlacementType
  childId: UUID
  unit: Unit
  startDate: LocalDate
  endDate: LocalDate
  overlap?: boolean
}
