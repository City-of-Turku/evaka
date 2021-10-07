// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import styled from 'styled-components'
import { H3 } from 'lib-components/typography'
import { Gap } from 'lib-components/white-space'
import { useTranslation } from '../../state/i18n'
import { VoucherValueDecisionDetailed } from '../../types/invoicing'
import { formatCents } from 'lib-common/money'
import { formatDecimal } from 'lib-common/utils/number'

type Props = {
  decision: VoucherValueDecisionDetailed
}

export default React.memo(function VoucherValueDecisionValueSection({
  decision: {
    childAge,
    ageCoefficient,
    capacityFactor,
    placement,
    serviceNeed,
    voucherValue
  }
}: Props) {
  const { i18n } = useTranslation()

  const mainDescription = `${
    i18n.valueDecision.summary.age[childAge < 3 ? 'LESS_THAN_3' : 'OVER_3']
  } (${ageCoefficient * 100} %), ${i18n.placement.type[
    placement.type
  ].toLowerCase()} ${serviceNeed.voucherValueDescriptionFi} (${
    serviceNeed.voucherValueCoefficient * 100
  } %)${
    capacityFactor !== 1
      ? `, ${i18n.valueDecision.summary.capacityFactor} ${formatDecimal(
          capacityFactor
        )}`
      : ''
  }`

  return (
    <section>
      <H3 noMargin>{i18n.valueDecision.summary.value}</H3>
      <Gap size="s" />
      <PartRow>
        <span>{mainDescription}</span>
        <b>{`${formatCents(voucherValue) ?? ''} €`}</b>
      </PartRow>
    </section>
  )
})

const PartRow = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin: 0 30px;
`
