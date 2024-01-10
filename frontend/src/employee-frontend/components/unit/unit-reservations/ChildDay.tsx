// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import styled, { css } from 'styled-components'

import { defaultMargins } from 'lib-components/white-space'
import colors from 'lib-customizations/common'

export const DateCell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
`

export const TimesRow = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: space-evenly;
  padding: ${defaultMargins.xs};
  gap: ${defaultMargins.xs};
`

export const TimeCell = styled.div<{ warning?: boolean }>`
  flex: 1 0 54px;
  text-align: center;
  white-space: nowrap;
  ${(p) =>
    p.warning &&
    css`
      color: ${colors.accents.a2orangeDark};
    `};
`
