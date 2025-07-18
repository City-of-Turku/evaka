// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useMemo } from 'react'
import styled from 'styled-components'

import type { UnitPreferenceFormData } from 'lib-common/api-types/application/ApplicationFormData'
import { formatPersonName } from 'lib-common/names'
import ListGrid from 'lib-components/layout/ListGrid'
import { H2, H3, Label } from 'lib-components/typography'
import { Gap } from 'lib-components/white-space'

import { useTranslation } from '../../../localization'

import { ApplicationDataGridLabelWidth } from './const'

const NumberedList = styled.ol`
  margin: 0;
  padding-left: 16px;
`

type UnitPreferenceSectionProps = {
  formData: UnitPreferenceFormData
}

export default React.memo(function UnitPreferenceSection({
  formData
}: UnitPreferenceSectionProps) {
  const t = useTranslation()
  const tLocal = t.applications.editor.verification.unitPreference
  const vtjSibling = formData.vtjSiblings.find((s) => s.selected)
  const vtjSiblingName = formatPersonName(
    vtjSibling ?? { firstName: '', lastName: '' },
    'First Last',
    t.components.common
  )

  const sibling = useMemo(() => {
    if (!formData.siblingBasis) return null

    return vtjSibling
      ? {
          name: vtjSiblingName,
          ssn: vtjSibling.socialSecurityNumber,
          unit: formData.siblingUnit
        }
      : {
          name: formData.siblingName,
          ssn: formData.siblingSsn,
          unit: formData.siblingUnit
        }
  }, [
    formData.siblingBasis,
    formData.siblingName,
    formData.siblingSsn,
    formData.siblingUnit,
    vtjSibling,
    vtjSiblingName
  ])

  return (
    <div data-qa="unit-preference-section">
      <H2 noMargin>{tLocal.title}</H2>

      <Gap size="s" />

      <H3>{tLocal.siblingBasis.title}</H3>
      <ListGrid
        labelWidth={ApplicationDataGridLabelWidth}
        rowGap="s"
        columnGap="L"
      >
        <Label>{tLocal.siblingBasis.siblingBasisLabel}</Label>
        {formData.siblingBasis ? (
          <>
            <span>{tLocal.siblingBasis.siblingBasisYes}</span>

            <Label>{tLocal.siblingBasis.name}</Label>
            <span translate="no">{sibling?.name}</span>

            <Label>{tLocal.siblingBasis.ssn}</Label>
            <span>{sibling?.ssn}</span>

            <Label>{tLocal.siblingBasis.unit}</Label>
            <span>{sibling?.unit}</span>
          </>
        ) : (
          <span>{t.applications.editor.verification.no}</span>
        )}
      </ListGrid>

      <Gap size="m" />

      <H3>{tLocal.units.title}</H3>
      <ListGrid
        labelWidth={ApplicationDataGridLabelWidth}
        rowGap="s"
        columnGap="L"
      >
        <Label>{tLocal.units.label}</Label>
        <NumberedList>
          {formData.preferredUnits.map((u) => (
            <li key={u.id}>{u.name}</li>
          ))}
        </NumberedList>
      </ListGrid>
    </div>
  )
})
