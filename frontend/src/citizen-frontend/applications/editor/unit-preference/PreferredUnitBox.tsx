// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import styled from 'styled-components'
import colors from 'lib-customizations/common'
import {
  FixedSpaceColumn,
  FixedSpaceFlexWrap
} from 'lib-components/layout/flex-helpers'
import { H4 } from 'lib-components/typography'
import IconButton from 'lib-components/atoms/buttons/IconButton'
import { faArrowDown, faArrowUp, faTimes } from 'lib-icons'
import { defaultMargins, Gap } from 'lib-components/white-space'
import InlineButton from 'lib-components/atoms/buttons/InlineButton'
import { StaticChip } from 'lib-components/atoms/Chip'
import { useTranslation } from '../../../localization'
import ExternalLink from 'lib-components/atoms/ExternalLink'
import { PublicUnit } from 'lib-common/api-types/units/PublicUnit'

export type PreferredUnitBoxProps = {
  unit: PublicUnit
  n: number
  remove: () => void
  moveUp: (() => void) | null
  moveDown: (() => void) | null
}

export default React.memo(function PreferredUnitBox({
  unit,
  n,
  remove,
  moveUp,
  moveDown
}: PreferredUnitBoxProps) {
  const t = useTranslation()

  const providerTypeText =
    unit.providerType === 'PRIVATE_SERVICE_VOUCHER'
      ? t.common.unit.providerTypes.PRIVATE
      : t.common.unit.providerTypes[unit.providerType]

  const getProviderTypeColors = (): { color: string; textColor: string } => {
    switch (unit.providerType) {
      case 'MUNICIPAL':
      case 'MUNICIPAL_SCHOOL':
        return {
          color: colors.accents.water,
          textColor: colors.greyscale.darkest
        }
      case 'PRIVATE':
      case 'PRIVATE_SERVICE_VOUCHER':
        return {
          color: colors.accents.emerald,
          textColor: colors.greyscale.white
        }
      case 'PURCHASED':
      case 'EXTERNAL_PURCHASED':
        return {
          color: colors.accents.green,
          textColor: colors.greyscale.darkest
        }
    }
  }

  return (
    <Wrapper>
      <MainColLeft>{n}</MainColLeft>
      <MainColCenter>
        <FixedSpaceColumn>
          <FixedSpaceColumn spacing={'xxs'}>
            <H4 noMargin>{unit.name}</H4>
            <span>{unit.streetAddress}</span>
            {unit.providerType === 'PRIVATE_SERVICE_VOUCHER' && (
              <ExternalLink
                href={
                  t.applications.editor.unitPreference.units.serviceVoucherLink
                }
                text={t.common.unit.providerTypes.PRIVATE_SERVICE_VOUCHER}
                newTab
              />
            )}
          </FixedSpaceColumn>
          <FixedSpaceFlexWrap horizontalSpacing={'xs'} verticalSpacing={'xs'}>
            {unit.language === 'sv' ? (
              <StaticChip color={colors.accents.yellow}>
                {t.applications.editor.unitPreference.units.preferences.sv}
              </StaticChip>
            ) : (
              <StaticChip color={colors.primary}>
                {t.applications.editor.unitPreference.units.preferences.fi}
              </StaticChip>
            )}
            <StaticChip {...getProviderTypeColors()}>
              {providerTypeText.toLowerCase()}
            </StaticChip>
          </FixedSpaceFlexWrap>
          <Gap size={'xs'} />
          <FixedSpaceFlexWrap verticalSpacing={'xs'}>
            <InlineButton
              text={
                t.applications.editor.unitPreference.units.preferences.moveUp
              }
              altText={`${unit.name} (${
                t.applications.editor.unitPreference.units.preferences[
                  unit.language
                ]
              }, ${providerTypeText}): ${
                t.applications.editor.unitPreference.units.preferences.moveUp
              }`}
              icon={faArrowUp}
              onClick={moveUp || noOp}
              disabled={!moveUp}
            />
            <InlineButton
              text={
                t.applications.editor.unitPreference.units.preferences.moveDown
              }
              altText={`${unit.name} (${
                t.applications.editor.unitPreference.units.preferences[
                  unit.language
                ]
              }, ${providerTypeText}): ${
                t.applications.editor.unitPreference.units.preferences.moveDown
              }`}
              icon={faArrowDown}
              onClick={moveDown || noOp}
              disabled={!moveDown}
            />
          </FixedSpaceFlexWrap>
        </FixedSpaceColumn>
      </MainColCenter>
      <MainColRight>
        <IconButton
          icon={faTimes}
          gray
          onClick={remove}
          altText={`${unit.name}: ${t.applications.editor.unitPreference.units.preferences.remove}`}
        />
      </MainColRight>
    </Wrapper>
  )
})

const noOp = () => undefined

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  border: 1px solid ${colors.primary};
  box-sizing: border-box;
  box-shadow: 0 4px 4px rgba(0, 0, 0, 0.15);
  border-radius: 2px;
`

const MainColLeft = styled.div`
  flex-grow: 0;
  font-family: Montserrat, sans-serif;
  font-style: normal;
  font-weight: 300;
  color: ${colors.primary};
  text-align: center;

  font-size: 70px;
  line-height: 56px;
  width: 60px;
  padding: ${defaultMargins.s};

  @media screen and (max-width: 769px) {
    font-size: 48px;
    line-height: 52px;
    width: 48px;
    padding: ${defaultMargins.xs};
  }
`

const MainColCenter = styled.div`
  flex-grow: 1;
  padding: ${defaultMargins.s} 0;
`

const MainColRight = styled.div`
  flex-grow: 0;
  padding: ${defaultMargins.s};
`
