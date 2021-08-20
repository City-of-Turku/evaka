// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { DayOfWeek, UUID } from './index'
import LocalDate from 'lib-common/local-date'
import FiniteDateRange from 'lib-common/finite-date-range'
import DateRange from 'lib-common/date-range'
import { PlacementType } from 'lib-common/api-types/serviceNeed/common'
import {
  PlacementPlanRejectReason,
  UnitProviderType
} from 'lib-customizations/types'

export interface CareArea {
  id: UUID
  name: string
  shortName: string
}

export type UnitTypes =
  | 'CLUB'
  | 'FAMILY'
  | 'CENTRE'
  | 'GROUP_FAMILY'
  | 'PRESCHOOL'
  | 'PREPARATORY_EDUCATION'

export type UnitLanguage = 'fi' | 'sv'

interface FinanceDecisionHandler {
  id: UUID
  firstName: string
  lastName: string
}

export type PilotFeature = 'MESSAGING' | 'MOBILE'

export interface Unit {
  id: UUID
  name: string
  openingDate: LocalDate | null
  closingDate: LocalDate | null
  area: CareArea
  type: UnitTypes[]
  daycareApplyPeriod: DateRange | null
  preschoolApplyPeriod: DateRange | null
  clubApplyPeriod: DateRange | null
  providerType: UnitProviderType
  roundTheClock: boolean
  capacity: number
  language: UnitLanguage
  ghostUnit: boolean
  uploadToVarda: boolean
  uploadChildrenToVarda: boolean
  uploadToKoski: boolean
  invoicedByMunicipality: boolean
  costCenter: string | null
  financeDecisionHandler: FinanceDecisionHandler | null
  additionalInfo: string | null
  phone: string | null
  email: string | null
  url: string | null
  visitingAddress: VisitingAddress
  location: Coordinate | null
  mailingAddress: MailingAddress
  unitManager: UnitManager | null
  decisionCustomization: DecisionCustomization
  ophUnitOid: string | null
  ophOrganizerOid: string | null
  ophOrganizationOid: string | null
  operationDays: DayOfWeek[] | null
  enabledPilotFeatures: PilotFeature[]
}

export interface DecisionCustomization {
  daycareName: string
  preschoolName: string
  handler: string
  handlerAddress: string
}

export interface UnitManager {
  name: string | null
  email: string | null
  phone: string | null
}

export interface VisitingAddress {
  streetAddress: string
  postalCode: string
  postOffice: string
}

export interface MailingAddress {
  streetAddress: string | null
  poBox: string | null
  postalCode: string | null
  postOffice: string | null
}

export interface Coordinate {
  lat: number
  lon: number
}

export interface UnitFiltersType {
  startDate: LocalDate
  endDate: LocalDate
}

export interface DaycarePlacement {
  id: UUID
  child: ChildBasics
  daycare: {
    id: UUID
    name: string
  }
  groupPlacements: DaycareGroupPlacement[]
  type: PlacementType
  missingServiceNeedDays: number
  startDate: LocalDate
  endDate: LocalDate
}

export interface ChildBasics {
  id: UUID
  socialSecurityNumber: string | null
  firstName: string | null
  lastName: string | null
  dateOfBirth: LocalDate
}

export type PlacementPlanConfirmationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'

export interface DaycarePlacementPlan {
  id: UUID
  unitId: UUID
  applicationId: UUID
  type: PlacementType
  period: FiniteDateRange
  preschoolDaycarePeriod: FiniteDateRange | null
  child: ChildBasics
  unitConfirmationStatus: PlacementPlanConfirmationStatus
  unitRejectReason: PlacementPlanRejectReason | null
  unitRejectOtherReason: string | null
}

export interface DaycareGroupPlacement {
  id: UUID | null
  groupId: UUID | null
  groupName: string | null
  daycarePlacementId: UUID
  type: PlacementType
  startDate: LocalDate
  endDate: LocalDate
}

export interface DaycareGroupPlacementDetailed extends DaycareGroupPlacement {
  daycarePlacementStartDate: LocalDate
  daycarePlacementEndDate: LocalDate
  daycarePlacementMissingServiceNeedDays: number
  child: ChildBasics
}

export const flatMapGroupPlacements = (
  daycarePlacements: DaycarePlacement[]
): DaycareGroupPlacementDetailed[] =>
  daycarePlacements.reduce((groupPlacements, daycarePlacement) => {
    daycarePlacement.groupPlacements
      .map<DaycareGroupPlacementDetailed>((groupPlacement) => ({
        ...groupPlacement,
        child: daycarePlacement.child,
        daycarePlacementStartDate: daycarePlacement.startDate,
        daycarePlacementEndDate: daycarePlacement.endDate,
        daycarePlacementId: daycarePlacement.id,
        daycarePlacementMissingServiceNeedDays:
          daycarePlacement.missingServiceNeedDays
      }))
      .forEach((groupPlacement) => groupPlacements.push(groupPlacement))

    return groupPlacements
  }, [] as DaycareGroupPlacementDetailed[])

export interface DaycareGroup {
  id: UUID
  daycareId: UUID
  name: string
  startDate: LocalDate
  endDate: LocalDate | null
  deletable: boolean
}

export interface DaycareGroupWithPlacements extends DaycareGroup {
  placements: DaycareGroupPlacementDetailed[]
}

export interface Stats {
  minimum: number
  maximum: number
}

export interface DaycareCapacityStats {
  unitTotalCaretakers: Stats
  groupCaretakers: {
    [groupId: string]: Stats
  }
}

export type OccupancyType = 'CONFIRMED' | 'PLANNED' | 'REALIZED'

export interface Occupancy {
  period: FiniteDateRange
  sum: number
  headcount: number
  caretakers?: number
  percentage?: number
}

export type DaycareDailyNoteLevelInfo = 'GOOD' | 'MEDIUM' | 'NONE'
export type DaycareDailyNoteReminder = 'DIAPERS' | 'CLOTHES' | 'LAUNDRY'

export interface DaycareDailyNote {
  id?: UUID
  childId?: UUID
  groupId?: UUID
  date: LocalDate | null
  note?: string
  feedingNote?: DaycareDailyNoteLevelInfo
  sleepingNote?: DaycareDailyNoteLevelInfo
  sleepingMinutes?: string
  reminders: DaycareDailyNoteReminder[]
  reminderNote?: string
  modifiedAt: Date | null
  modifiedBy?: string
}
