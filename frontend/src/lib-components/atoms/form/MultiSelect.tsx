// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import classNames from 'classnames'
import React from 'react'
import ReactSelect, { Props } from 'react-select'
import styled from 'styled-components'
import { FixedSpaceColumn, FixedSpaceRow } from '../../layout/flex-helpers'
import { fontWeights } from '../../typography'
import { defaultMargins } from '../../white-space'
import { StaticCheckBox } from './Checkbox'

interface MultiSelectProps<T> {
  value: readonly T[]
  options: readonly T[]
  getOptionId: (value: T) => string
  getOptionLabel: (value: T) => string
  getOptionSecondaryText?: (value: T) => string
  onChange: (selected: T[]) => void
  maxSelected?: number
  placeholder: string
  noOptionsMessage?: string
  showValuesInInput?: boolean
  closeMenuOnSelect?: Props<T>['closeMenuOnSelect']
  isClearable?: Props<T>['isClearable']
  inputId?: Props<T>['inputId']
  'data-qa'?: string
}

function MultiSelect<T>({
  value,
  options,
  getOptionId,
  getOptionLabel,
  getOptionSecondaryText,
  onChange,
  closeMenuOnSelect,
  noOptionsMessage,
  maxSelected,
  showValuesInInput: showSelectedValues,
  ...props
}: MultiSelectProps<T>) {
  return (
    <div data-qa={props['data-qa']}>
      <ReactSelect
        isMulti
        isSearchable={true}
        hideSelectedOptions={false}
        backspaceRemovesValue={false}
        closeMenuOnSelect={closeMenuOnSelect ?? false}
        noOptionsMessage={() => noOptionsMessage ?? 'Ei tuloksia'}
        getOptionLabel={getOptionLabel}
        getOptionValue={getOptionId}
        value={value}
        tabSelectsValue={false}
        options={[
          {
            options: value
          },
          {
            options:
              maxSelected === undefined || value.length < maxSelected
                ? options.filter(
                    (o) =>
                      !value
                        .map((o2) => getOptionId(o2))
                        .includes(getOptionId(o))
                  )
                : []
          }
        ]}
        onChange={(selected) => {
          const selectionsArray =
            selected && 'length' in selected ? (selected as T[]) : []
          onChange(selectionsArray)
        }}
        filterOption={({ data }, q) =>
          getOptionLabel(data).toLowerCase().includes(q.toLowerCase())
        }
        controlShouldRenderValue={showSelectedValues ?? true}
        components={{
          Option: function Option({ innerRef, innerProps, ...props }) {
            const data = props.data as T

            return (
              <OptionWrapper
                data-qa="option"
                data-id={getOptionId(data)}
                ref={innerRef}
                {...innerProps}
                key={getOptionId(data)}
                className={classNames({ focused: props.isFocused })}
              >
                <OptionContents
                  label={getOptionLabel(data)}
                  secondaryText={
                    getOptionSecondaryText && getOptionSecondaryText(data)
                  }
                  selected={props.isSelected}
                />
              </OptionWrapper>
            )
          },
          MultiValueContainer: function MultiValueContainer({
            data,
            children,
            innerProps
          }) {
            return (
              <div
                {...innerProps}
                data-qa="multivalue"
                data-id={getOptionId(data)}
              >
                {children}
              </div>
            )
          }
        }}
        {...props}
      />
    </div>
  )
}

export default React.memo(MultiSelect) as typeof MultiSelect

const OptionWrapper = styled.div`
  cursor: pointer;

  &:hover,
  &.focused {
    background-color: ${({ theme: { colors } }) => colors.main.lighter};
  }

  padding: ${defaultMargins.xxs} ${defaultMargins.s};
`

const OptionContents = React.memo(function Option({
  label,
  secondaryText,
  selected
}: {
  label: string
  secondaryText?: string
  selected: boolean
}) {
  return (
    <FixedSpaceRow alignItems="center">
      <StaticCheckBox checked={selected} />
      <FixedSpaceColumn spacing="zero">
        <span>{label}</span>
        {secondaryText && <SecondaryText>{secondaryText}</SecondaryText>}
      </FixedSpaceColumn>
    </FixedSpaceRow>
  )
})

const SecondaryText = styled.span`
  font-size: 14px;
  line-height: 21px;
  font-weight: ${fontWeights.semibold};
  color: ${({ theme: { colors } }) => colors.greyscale.dark};
`
