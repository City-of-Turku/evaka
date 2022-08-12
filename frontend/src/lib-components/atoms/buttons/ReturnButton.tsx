// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import { useNavigate } from 'react-router-dom'
import styled, { useTheme } from 'styled-components'

import { faAngleLeft } from 'lib-icons'

import { defaultMargins } from '../../white-space'

import InlineButton from './InlineButton'

interface WrapperProps {
  margin?: string
}
export const ReturnButtonWrapper = styled.div<WrapperProps>`
  margin: ${(p) => p.margin ?? defaultMargins.xs} 0;

  button {
    padding-left: 0;
    margin-left: 0;
    justify-content: flex-start;
  }

  @media (max-width: 1215px) {
    margin-left: ${defaultMargins.s};
  }

  @media print {
    display: none;
  }
`

type Props = {
  label: string
  'data-qa'?: string
  onClick?: () => void
}

export default React.memo(function ReturnButton({
  label,
  'data-qa': dataQa,
  onClick,
  margin
}: Props & WrapperProps) {
  const { colors } = useTheme()
  const navigate = useNavigate()
  const defaultBehaviour = () => navigate(-1)
  return (
    <ReturnButtonWrapper margin={margin}>
      <InlineButton
        icon={faAngleLeft}
        text={label}
        onClick={onClick ?? defaultBehaviour}
        data-qa={dataQa}
        disabled={history.length <= 1}
        color={colors.main.m1}
      />
    </ReturnButtonWrapper>
  )
})
