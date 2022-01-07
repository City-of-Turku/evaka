// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

// GENERATED FILE: no manual modifications
/* eslint-disable import/order, prettier/prettier */

import FiniteDateRange from '../../finite-date-range'
import LocalDate from '../../local-date'
import { ServiceNeed } from './serviceneed'
import { UUID } from '../../types'

/**
* Generated from fi.espoo.evaka.backupcare.BackupCareChild
*/
export interface BackupCareChild {
  birthDate: LocalDate
  firstName: string
  id: UUID
  lastName: string
}

/**
* Generated from fi.espoo.evaka.backupcare.BackupCareCreateResponse
*/
export interface BackupCareCreateResponse {
  id: UUID
}

/**
* Generated from fi.espoo.evaka.backupcare.BackupCareGroup
*/
export interface BackupCareGroup {
  id: UUID
  name: string
}

/**
* Generated from fi.espoo.evaka.backupcare.BackupCareUnit
*/
export interface BackupCareUnit {
  id: UUID
  name: string
}

/**
* Generated from fi.espoo.evaka.backupcare.BackupCareUpdateRequest
*/
export interface BackupCareUpdateRequest {
  groupId: UUID | null
  period: FiniteDateRange
}

/**
* Generated from fi.espoo.evaka.backupcare.ChildBackupCare
*/
export interface ChildBackupCare {
  group: BackupCareGroup | null
  id: UUID
  period: FiniteDateRange
  unit: BackupCareUnit
}

/**
* Generated from fi.espoo.evaka.backupcare.ChildBackupCaresResponse
*/
export interface ChildBackupCaresResponse {
  backupCares: ChildBackupCare[]
}

/**
* Generated from fi.espoo.evaka.backupcare.NewBackupCare
*/
export interface NewBackupCare {
  groupId: UUID | null
  period: FiniteDateRange
  unitId: UUID
}

/**
* Generated from fi.espoo.evaka.backupcare.UnitBackupCare
*/
export interface UnitBackupCare {
  child: BackupCareChild
  group: BackupCareGroup | null
  id: UUID
  missingServiceNeedDays: number
  period: FiniteDateRange
  serviceNeeds: ServiceNeed[]
}

/**
* Generated from fi.espoo.evaka.backupcare.UnitBackupCaresResponse
*/
export interface UnitBackupCaresResponse {
  backupCares: UnitBackupCare[]
}
