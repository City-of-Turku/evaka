// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import styled from 'styled-components'
import { formatDecimal } from 'lib-common/utils/number'
import colors from 'lib-customizations/common'

interface Props {
  editable: boolean
  value: number
  disabled?: boolean
  onPlus?: () => void
  onMinus?: () => void
  'data-qa'?: string
}

export default function PlusMinus({
  editable,
  value,
  disabled,
  onPlus,
  onMinus,
  'data-qa': dataQa
}: Props) {
  const str = formatDecimal(value)
  return (
    <Root data-qa={dataQa}>
      {editable && (
        <>
          <TextButton
            disabled={disabled}
            onClick={onMinus}
            data-qa="minus-button"
          >
            -
          </TextButton>
        </>
      )}
      <Value data-qa="value">{str}</Value>
      {editable && (
        <>
          <TextButton
            disabled={disabled}
            onClick={onPlus}
            data-qa="plus-button"
          >
            +
          </TextButton>
        </>
      )}
    </Root>
  )
}

const Root = styled.div`
  color: ${colors.main.m1};
  display: flex;
  justify-content: center;
`

const Value = styled.span`
  font-size: 70px;
  min-width: 150px;
  text-align: center;
`

const TextButton = styled.button`
  border: none;
  outline: none;
  background-color: transparent;
  font-size: 48px;
  color: ${colors.main.m1};
`
