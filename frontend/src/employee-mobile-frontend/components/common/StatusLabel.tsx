// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import styled from 'styled-components'
import colors from 'lib-customizations/common'
import { fontWeights } from 'lib-components/typography'
import { useTranslation } from '../../state/i18n'

export type StatusLabelType = 'coming' | 'active' | 'completed' | 'conflict'

const Container = styled.div<{ status: StatusLabelType }>`
  height: 25px;
  width: fit-content;
  border-radius: 12px;
  padding: 0 10px;
  text-align: center;
  font-weight: ${fontWeights.semibold};
  font-size: 14px;
  letter-spacing: 0;

  ${(p) =>
    p.status == 'coming'
      ? `
   color: ${colors.accents.greenDark};
   border: 1px solid ${colors.accents.greenDark};
  `
      : ''}

  ${(p) =>
    p.status == 'active'
      ? `
   color: ${colors.greyscale.white};
   background: ${colors.accents.greenDark};
  `
      : ''}

  ${(p) =>
    p.status == 'completed'
      ? `
   color: ${colors.greyscale.dark};
   border: 1px solid ${colors.greyscale.medium};
  `
      : ''}

  ${(p) =>
    p.status == 'conflict'
      ? `
   color: ${colors.greyscale.white};
   background: ${colors.accents.dangerRed};
  `
      : ''}
`

export interface Props {
  status: StatusLabelType
}

function StatusLabel({ status }: Props) {
  const { i18n } = useTranslation()

  return <Container status={status}>{i18n.common.statuses[status]}</Container>
}

export default StatusLabel
