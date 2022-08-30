// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import styled from 'styled-components'

import FiniteDateRange from 'lib-common/finite-date-range'
import { DailyReservationData } from 'lib-common/generated/api-types/reservations'
import {
  Repetition,
  ReservationFormData,
  ValidationResult
} from 'lib-common/reservations'
import { defaultMargins } from 'lib-components/white-space'

import DailyRepetitionTimeInputGrid from './DailyRepetitionTimeInputGrid'
import IrregularRepetitionTimeInputGrid from './IrregularRepetitionTimeInputGrid'
import WeeklyRepetitionTimeInputGrid from './WeeklyRepetitionTimeInputGrid'

export interface RepetitionTimeInputGridProps {
  formData: ReservationFormData
  childrenInShiftCare: boolean
  includedDays: number[]
  updateForm: (updated: Partial<ReservationFormData>) => void
  showAllErrors: boolean
  existingReservations: DailyReservationData[]
  validationResult: ValidationResult
  selectedRange: FiniteDateRange
}

export default React.memo(function RepetitionTimeInputGrid({
  repetition,
  ...props
}: RepetitionTimeInputGridProps & { repetition: Repetition }) {
  switch (repetition) {
    case 'DAILY':
      return (
        <TimeInputGrid>
          <DailyRepetitionTimeInputGrid {...props} />
        </TimeInputGrid>
      )
    case 'WEEKLY':
      return (
        <TimeInputGrid>
          <WeeklyRepetitionTimeInputGrid {...props} />
        </TimeInputGrid>
      )
    case 'IRREGULAR':
      return (
        <TimeInputGrid>
          <IrregularRepetitionTimeInputGrid {...props} />
        </TimeInputGrid>
      )
  }
})

const TimeInputGrid = styled.div`
  display: grid;
  grid-template-columns: max-content max-content auto;
  grid-column-gap: ${defaultMargins.s};
  grid-row-gap: ${defaultMargins.s};
  align-items: center;
  grid-auto-rows: 1fr;
`
