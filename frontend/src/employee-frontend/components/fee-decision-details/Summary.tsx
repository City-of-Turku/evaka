// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import styled from 'styled-components'
import { faEuroSign } from 'lib-icons'
import { Gap } from 'lib-components/white-space'
import CollapsibleSection from 'lib-components/molecules/CollapsibleSection'
import { H4 } from 'lib-components/typography'
import IncomeSection from './IncomeSection'
import ChildrenSection from './ChildrenSection'
import { useTranslation } from '../../state/i18n'
import { FeeDecisionDetailed } from '../../types/invoicing'
import { formatCents } from 'lib-common/money'

interface Props {
  decision: FeeDecisionDetailed
}

export default React.memo(function Summary({ decision }: Props) {
  const { i18n } = useTranslation()

  return (
    <CollapsibleSection
      title={i18n.feeDecision.form.summary.title}
      icon={faEuroSign}
      startCollapsed={false}
      className="income-summary"
    >
      <IncomeSection decision={decision} />
      <Gap size="m" />
      <ChildrenSection decision={decision} />
      <Gap size="m" />
      <Total data-qa="decision-summary-total-price">
        <TotalTitle noMargin>
          {i18n.feeDecision.form.summary.totalPrice}
        </TotalTitle>
        <b>{formatCents(decision.totalFee)} €</b>
      </Total>
    </CollapsibleSection>
  )
})

const Total = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  background: ghostwhite;
  padding: 30px;
`

const TotalTitle = styled(H4)`
  font-weight: 600;
`
