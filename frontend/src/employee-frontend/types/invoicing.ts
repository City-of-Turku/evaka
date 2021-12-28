// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { IncomeEffect } from 'lib-common/api-types/income'
import DateRange from 'lib-common/date-range'
import { JsonOf } from 'lib-common/json'
import LocalDate from 'lib-common/local-date'
import { FeeAlterationType } from './fee-alteration'
import { Income } from './income'
import { PlacementType } from 'lib-common/generated/enums'
import {
  Basic as PersonBasic,
  Detailed as PersonDetailed,
  VoucherValueDecisionType
} from 'lib-common/generated/api-types/invoicing'
import { UUID } from 'lib-common/types'

// Enums

export type FeeDecisionStatus =
  | 'DRAFT'
  | 'WAITING_FOR_SENDING'
  | 'WAITING_FOR_MANUAL_SENDING'
  | 'SENT'
  | 'ANNULLED'

export type DecisionDistinctiveDetails =
  | 'UNCONFIRMED_HOURS'
  | 'EXTERNAL_CHILD'
  | 'RETROACTIVE'

export type VoucherValueDecisionStatus =
  | 'DRAFT'
  | 'WAITING_FOR_SENDING'
  | 'WAITING_FOR_MANUAL_SENDING'
  | 'SENT'
  | 'ANNULLED'

export type InvoiceStatus =
  | 'DRAFT'
  | 'WAITING_FOR_SENDING'
  | 'SENT'
  | 'CANCELED'

export type ServiceNeed =
  | 'MISSING'
  | 'GTE_35'
  | 'GTE_25'
  | 'GT_25_LT_35'
  | 'GT_15_LT_25'
  | 'LTE_25'
  | 'LTE_15'
  | 'LTE_0'

export type Product =
  | 'DAYCARE'
  | 'DAYCARE_DISCOUNT'
  | 'DAYCARE_INCREASE'
  | 'PRESCHOOL_WITH_DAYCARE'
  | 'PRESCHOOL_WITH_DAYCARE_DISCOUNT'
  | 'PRESCHOOL_WITH_DAYCARE_INCREASE'
  | 'TEMPORARY_CARE'
  | 'SICK_LEAVE_100'
  | 'SICK_LEAVE_50'
  | 'ABSENCE'
  | 'EU_CHEMICAL_AGENCY'
  | 'OTHER_MUNICIPALITY'
  | 'FREE_OF_CHARGE'

export type InvoiceDistinctiveDetails = 'MISSING_ADDRESS'

export type FeeDecisionType =
  | 'NORMAL'
  | 'RELIEF_REJECTED'
  | 'RELIEF_PARTLY_ACCEPTED'
  | 'RELIEF_ACCEPTED'

// Other types and interfaces
// + accompanying deserialization methods

interface Periodic {
  periodStart: LocalDate
  periodEnd: LocalDate
}

export const deserializePeriodic = <E extends Periodic>(json: JsonOf<E>): E => {
  return {
    ...json,
    periodStart: LocalDate.parseIso(json.periodStart),
    periodEnd: LocalDate.parseIso(json.periodEnd)
  } as E
}

export const deserializePersonBasic = (
  json: JsonOf<PersonBasic>
): PersonBasic => ({
  ...json,
  dateOfBirth: LocalDate.parseIso(json.dateOfBirth)
})

export const deserializePersonDetailed = (
  json: JsonOf<PersonDetailed>
): PersonDetailed => ({
  ...json,
  dateOfBirth: LocalDate.parseIso(json.dateOfBirth),
  dateOfDeath: LocalDate.parseNullableIso(json.dateOfDeath)
})

export interface InvoiceCodes {
  products: Product[]
  agreementTypes: number[]
  subCostCenters: string[]
  costCenters: string[]
}

export interface Unit {
  id: UUID
  name: string
}

export interface UnitDetailed {
  id: UUID
  name: string
  areaId: UUID
  areaName: string
  language: string
}

export interface InvoiceSummary extends Periodic {
  id: UUID
  status: InvoiceStatus
  headOfFamily: PersonDetailed
  rows: Array<{ child: PersonBasic }>
  totalPrice: number
  createdAt: Date | null
}

export interface InvoiceRowDetailed extends Periodic {
  id: UUID | null
  child: PersonDetailed
  amount: number
  unitPrice: number
  product: Product
  costCenter: string
  subCostCenter: string | null
  description: string
  price: number
}

/**
 * TODO: Update /invoices/head-of-family/{uuid} to return InvoiceSummary instead and ditch this type
 */
export interface Invoice extends Periodic {
  id: UUID
  status: InvoiceStatus
  sentAt: Date | null
  totalPrice: number
}

export interface InvoiceDetailed extends Periodic {
  id: UUID
  status: InvoiceStatus
  dueDate: LocalDate
  invoiceDate: LocalDate
  agreementType: number
  headOfFamily: PersonDetailed
  rows: InvoiceRowDetailed[]
  number: string | null
  sentAt: Date | null
  account: number
  totalPrice: number
}

interface FeeDecisionAlteration {
  type: FeeAlterationType
  amount: number
  isAbsolute: boolean
  effect: number
}

export interface FeeDecisionChildDetailed {
  child: PersonDetailed
  placementType: PlacementType
  placementUnit: UnitDetailed
  serviceNeedFeeCoefficient: number
  serviceNeedDescriptionFi: string
  serviceNeedDescriptionSv: string
  serviceNeedMissing: boolean
  baseFee: number
  siblingDiscount: number
  fee: number
  feeAlterations: FeeDecisionAlteration[]
  finalFee: number
}

/**
 * TODO: Update /decisions/head-of-family/{uuid} to return FeeDecisionSummary instead and ditch this type
 */
export interface FeeDecision {
  id: UUID
  status: FeeDecisionStatus
  decisionNumber: number | null
  validDuring: DateRange
  sentAt: Date | null
  totalFee: number
  created: Date
}

export interface FeeDecisionDetailed {
  id: UUID
  status: FeeDecisionStatus
  decisionNumber: number | null
  decisionType: FeeDecisionType
  validDuring: DateRange
  headOfFamily: PersonDetailed
  partner: PersonDetailed | null
  headOfFamilyIncome: Income | null
  partnerIncome: Income | null
  feeThresholds: FeeDecisionThresholds
  familySize: number
  children: FeeDecisionChildDetailed[]
  documentKey: string | null
  approvedAt: Date | null
  sentAt: Date | null
  financeDecisionHandlerFirstName: string | null
  financeDecisionHandlerLastName: string | null
  approvedBy: { firstName: string; lastName: string } | null
  totalFee: number
  incomeEffect: IncomeEffect | 'NOT_AVAILABLE'
  totalIncome: number | null
  requiresManualSending: boolean
  isRetroactive: boolean
  created: Date
  isElementaryFamily: boolean | null
}

export interface FeeDecisionSummary {
  id: UUID
  status: FeeDecisionStatus
  decisionNumber: number | null
  validDuring: DateRange
  headOfFamily: PersonBasic
  children: PersonBasic[]
  approvedAt: Date | null
  sentAt: Date | null
  finalPrice: number
  created: Date
}

export interface FeeDecisionThresholds {
  minIncomeThreshold: number
  maxIncomeThreshold: number
  minFee: number
  maxFee: number
  incomeMultiplier: number
}

export interface VoucherValueDecisionDetailed {
  id: UUID
  status: VoucherValueDecisionStatus
  validFrom: LocalDate
  validTo: LocalDate | null
  decisionNumber: number | null
  headOfFamily: PersonDetailed
  partner: PersonDetailed | null
  headOfFamilyIncome: Income | null
  partnerIncome: Income | null
  feeThresholds: FeeDecisionThresholds
  familySize: number
  child: PersonDetailed
  placement: VoucherValueDecisionPlacement
  serviceNeed: VoucherValueDecisionServiceNeed
  baseCoPayment: number
  siblingDiscount: number
  coPayment: number
  feeAlterations: FeeDecisionAlteration[]
  finalCoPayment: number
  baseValue: number
  childAge: number
  ageCoefficient: number
  capacityFactor: number
  voucherValue: number
  documentKey: string | null
  approvedAt: Date | null
  sentAt: Date | null
  created: Date
  financeDecisionHandlerFirstName: string | null
  financeDecisionHandlerLastName: string | null
  incomeEffect: IncomeEffect | 'NOT_AVAILABLE'
  totalIncome: number | null
  requiresManualSending: boolean
  isRetroactive: boolean
  decisionType: VoucherValueDecisionType
  isElementaryFamily: boolean | null
}

export interface VoucherValueDecisionPlacement {
  unit: UnitDetailed
  type: PlacementType
}

export interface VoucherValueDecisionServiceNeed {
  feeCoefficient: number
  voucherValueCoefficient: number
  feeDescriptionFi: string
  feeDescriptionSv: string
  voucherValueDescriptionFi: string
  voucherValueDescriptionSv: string
}

export interface VoucherValueDecisionSummary {
  id: UUID
  status: VoucherValueDecisionStatus
  validFrom: LocalDate
  validTo: LocalDate | null
  decisionNumber: number | null
  headOfFamily: PersonBasic
  child: PersonBasic
  finalCoPayment: number
  voucherValue: number
  approvedAt: Date | null
  sentAt: Date | null
  created: Date
}
