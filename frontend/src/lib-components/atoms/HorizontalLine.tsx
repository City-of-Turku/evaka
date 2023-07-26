// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import styled from 'styled-components'

import { tabletMin } from '../breakpoints'
import { defaultMargins } from '../white-space'

const HorizontalLine = styled.hr<{
  slim?: boolean
  dashed?: boolean
  hiddenOnTabletAndDesktop?: boolean
  hiddenOnMobile?: boolean
}>`
  width: 100%;
  margin-block-start: ${(p) => (p.slim ? defaultMargins.m : defaultMargins.XL)};
  margin-block-end: ${(p) => (p.slim ? defaultMargins.m : defaultMargins.XL)};
  border: none;
  border-bottom-width: 1px;
  border-bottom-style: ${(p) => (p.dashed ? 'dashed' : 'solid')};
  border-bottom-color: ${(p) => p.theme.colors.grayscale.g15};

  @media (min-width: ${tabletMin}) {
    display: ${(p) => (p.hiddenOnTabletAndDesktop ? 'none' : 'block')};
  }

  @media (max-width: ${tabletMin}) {
    display: ${(p) => (p.hiddenOnMobile ? 'none' : 'block')};
    margin-block-start: ${(p) =>
      p.slim ? defaultMargins.s : defaultMargins.L};
    margin-block-end: ${(p) => (p.slim ? defaultMargins.s : defaultMargins.L)};
  }
`

export default HorizontalLine
