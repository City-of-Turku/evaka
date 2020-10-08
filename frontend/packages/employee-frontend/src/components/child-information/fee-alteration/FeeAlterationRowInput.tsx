// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { Dispatch, SetStateAction } from 'react'
import styled from 'styled-components'
import InputField from '~components/shared/atoms/form/InputField'
import SimpleSelect from '~components/shared/atoms/form/SimpleSelect'
import Colors from '~components/shared/Colors'
import { FeeAlterationType, PartialFeeAlteration } from '~types/fee-alteration'

interface Props {
  edited: PartialFeeAlteration
  setEdited: Dispatch<SetStateAction<PartialFeeAlteration>>
  typeOptions: Array<{ label: string; value: string }>
}

export default React.memo(function FeeAlterationRowInput({
  edited,
  setEdited,
  typeOptions
}: Props) {
  return (
    <>
      <SimpleSelect
        value={edited.type}
        options={typeOptions}
        onChange={(e) =>
          setEdited({ ...edited, type: e.target.value as FeeAlterationType })
        }
      />
      <AmountInput
        type="number"
        value={edited.amount !== undefined ? edited.amount.toString() : ''}
        onChange={(value) =>
          setEdited({
            ...edited,
            amount: Math.max(0, Math.min(99999, Number(value)))
          })
        }
      />
      <IsAbsoluteRadio
        value={edited.isAbsolute}
        onChange={(isAbsolute) => setEdited({ ...edited, isAbsolute })}
      />
    </>
  )
})

const AmountInput = styled(InputField)`
  width: 5rem;
  text-align: right;
`

function IsAbsoluteRadio({
  value,
  onChange
}: {
  value: boolean
  onChange(v: boolean): void
}) {
  return (
    <RadioContainer>
      <RadioInput
        type="radio"
        name="is-absolute"
        id="is-absolute-false"
        value="false"
        onChange={() => onChange(false)}
      />
      <RadioLabelLeft htmlFor="is-absolute-false" selected={!value}>
        %
      </RadioLabelLeft>
      <RadioInput
        type="radio"
        name="is-absolute"
        id="is-absolute-true"
        value="true"
        onChange={() => onChange(true)}
      />
      <RadioLabelRight htmlFor="is-absolute-true" selected={value}>
        €
      </RadioLabelRight>
    </RadioContainer>
  )
}

const RadioContainer = styled.div`
  width: 140px;
  display: flex;
  justify-content: stretch;
`

const RadioInput = styled.input`
  display: none;
`

const RadioLabel = styled.label<{ selected: boolean }>`
  padding: 6px 22px;
  border: 1px solid ${Colors.primary};
  color: ${Colors.primary};

  ${({ selected }) => (selected ? `color: ${Colors.greyscale.white};` : '')}
  ${({ selected }) => (selected ? `background-color: ${Colors.primary};` : '')}
`

const RadioLabelLeft = styled(RadioLabel)`
  border-right: none;
  border-radius: 2px 0 0 2px;
`

const RadioLabelRight = styled(RadioLabel)`
  border-left: none;
  border-radius: 0 2px 2px 0;
`
