// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import AsyncButton from 'lib-components/atoms/buttons/AsyncButton'
import Button from 'lib-components/atoms/buttons/Button'
import InlineButton from 'lib-components/atoms/buttons/InlineButton'
import HorizontalLine from 'lib-components/atoms/HorizontalLine'
import Title from 'lib-components/atoms/Title'
import { fontWeights, Label } from 'lib-components/typography'
import {
  defaultMargins,
  isSpacingSize,
  SpacingSize
} from 'lib-components/white-space'
import colors from 'lib-customizations/common'
import styled from 'styled-components'

export const WideButton = styled(Button)`
  width: 100%;
`

export const BigWideButton = styled(WideButton)`
  white-space: normal;
  height: 64px;
`

export const WideInlineButton = styled(InlineButton)`
  white-space: normal;
  width: 100%;
`

export const WideAsyncButton = styled(AsyncButton)`
  @media screen and (max-width: 1023px) {
    margin-bottom: ${defaultMargins.s};
    width: 100%;
    white-space: normal;
    height: 64px;
  }
`

export const InlineWideAsyncButton = styled(WideAsyncButton)`
  border: none;
`

export interface CustomButtonProps {
  color?: string
  backgroundColor?: string
  borderColor?: string
}

export const CustomButton = styled(Button)<CustomButtonProps>`
  @media screen and (max-width: 1023px) {
    margin-bottom: ${defaultMargins.s};
    width: calc(50vw - 40px);
    white-space: normal;
    height: 64px;
  }

  @media screen and (min-width: 1024px) {
    margin-right: ${defaultMargins.s};
  }
  ${(p) => (p.color ? `color: ${p.color};` : '')}
  ${(p) => (p.backgroundColor ? `background-color: ${p.backgroundColor};` : '')}
  ${(p) => (p.borderColor ? `border-color: ${p.borderColor};` : '')}

  :hover {
    ${(p) => (p.color ? `color: ${p.color};` : '')}
    ${(p) =>
      p.backgroundColor ? `background-color: ${p.backgroundColor};` : ''}
  ${(p) => (p.borderColor ? `border-color: ${p.borderColor};` : '')}
  }
`

export const Flex = styled.div`
  @media screen and (max-width: 1023px) {
    justify-content: space-between;
  }
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
`

export const FlexColumn = styled.div<{
  paddingHorizontal?: SpacingSize | string
}>`
  @media screen and (max-width: 1023px) {
    justify-content: space-between;
  }
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  padding: ${(p) =>
    `0 ${
      p.paddingHorizontal
        ? isSpacingSize(p.paddingHorizontal)
          ? defaultMargins[p.paddingHorizontal]
          : p.paddingHorizontal
        : 0
    }`};
`

export const FlexLabel = styled(Label)`
  display: flex;
  align-items: center;

  span {
    margin-right: ${defaultMargins.m};
  }
`

export const ArrivalTime = styled.span`
  font-family: 'Open Sans', sans-serif;
  font-size: 16px;
  font-style: normal;
  font-weight: ${fontWeights.medium};
  line-height: 27px;
  letter-spacing: 0em;
  display: flex;
  color: ${colors.greyscale.dark};

  span:first-child {
    margin-right: ${defaultMargins.xs};
    font-weight: ${fontWeights.semibold};
  }
`

export const CustomHorizontalLine = styled(HorizontalLine)`
  margin-bottom: 14px;
  margin-top: 14px;
`

export const ServiceTime = styled.div`
  padding: ${defaultMargins.xxs};
  color: ${colors.greyscale.dark};
  text-align: center;
`

export const Actions = styled.div`
  width: 100%;
  display: flex;

  * > button {
    width: 50%;
  }
`

export const CustomTitle = styled(Title)`
  margin-top: 0;
  margin-bottom: 0;
  text-align: center;
`

export const DailyNotes = styled.div`
  display: flex;
`

export const BackButtonInline = styled(InlineButton)`
  color: ${colors.blues.dark};
  margin-top: ${defaultMargins.s};
  margin-left: ${defaultMargins.s};
  margin-bottom: ${defaultMargins.s};
  overflow-x: hidden;
  width: calc(100vw - 16px);
  display: flex;
`
