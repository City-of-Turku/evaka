// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useState } from 'react'
import styled from 'styled-components'
import AsyncButton from 'lib-components/atoms/buttons/AsyncButton'
import { useTranslation } from '../../state/i18n'
import StickyActionBar from '../common/StickyActionBar'
import { confirmFeeDecisions } from '../../api/invoicing'
import { FeeDecisionStatus } from '../../types/invoicing'
import { CheckedRowsInfo } from '../common/CheckedRowsInfo'
import colors from 'lib-customizations/common'

const ErrorMessage = styled.div`
  color: ${colors.accents.red};
  margin: 0 20px;
`

type Props = {
  status: FeeDecisionStatus
  checkedIds: string[]
  clearChecked: () => void
  loadDecisions: () => void
}

const Actions = React.memo(function Actions({
  status,
  checkedIds,
  clearChecked,
  loadDecisions
}: Props) {
  const { i18n } = useTranslation()
  const [error, setError] = useState<string>()

  return status === 'DRAFT' ? (
    <StickyActionBar align={'right'}>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {checkedIds.length > 0 ? (
        <CheckedRowsInfo>
          {i18n.feeDecisions.buttons.checked(checkedIds.length)}
        </CheckedRowsInfo>
      ) : null}
      <AsyncButton
        primary
        text={i18n.feeDecisions.buttons.createDecision(checkedIds.length)}
        disabled={checkedIds.length === 0}
        onClick={() =>
          confirmFeeDecisions(checkedIds).then((result) => {
            if (result.isSuccess) {
              setError(undefined)
            }

            if (result.isFailure) {
              setError(i18n.common.error.unknown)
            }

            return result
          })
        }
        onSuccess={() => {
          clearChecked()
          loadDecisions()
        }}
        data-qa="confirm-decisions"
      />
    </StickyActionBar>
  ) : null
})

export default Actions
