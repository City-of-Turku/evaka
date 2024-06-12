// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useContext, useEffect, useState } from 'react'

import { combine, Loading, Result } from 'lib-common/api'
import { useBoolean } from 'lib-common/form/hooks'
import { useQueryResult } from 'lib-common/query'
import useRouteParams from 'lib-common/useRouteParams'
import { LegacyButton } from 'lib-components/atoms/buttons/LegacyButton'
import {
  LegacyMutateButton,
  cancelMutation
} from 'lib-components/atoms/buttons/LegacyMutateButton'
import { Container, ContentArea } from 'lib-components/layout/Container'
import { Gap } from 'lib-components/white-space'

import UnitEditor from '../../../components/unit/unit-details/UnitEditor'
import { getEmployeesQuery } from '../../../queries'
import { useTranslation } from '../../../state/i18n'
import { FinanceDecisionHandlerOption } from '../../../state/invoicing-ui'
import { TitleContext, TitleState } from '../../../state/title'
import { renderResult } from '../../async-rendering'
import { areaQuery, unitQuery, updateUnitMutation } from '../queries'

export default React.memo(function UnitDetailsPage() {
  const { id } = useRouteParams(['id'])
  const { i18n } = useTranslation()
  const { setTitle } = useContext<TitleState>(TitleContext)
  const unit = useQueryResult(unitQuery({ daycareId: id }))
  const areas = useQueryResult(areaQuery())
  const [financeDecisionHandlerOptions, setFinanceDecisionHandlerOptions] =
    useState<Result<FinanceDecisionHandlerOption[]>>(Loading.of())
  const [editable, useEditable] = useBoolean(false)
  useEffect(() => {
    if (unit.isSuccess) {
      setTitle(unit.value.daycare.name)
    }
  }, [setTitle, unit])

  const employeesResponse = useQueryResult(getEmployeesQuery())

  useEffect(() => {
    setFinanceDecisionHandlerOptions(
      employeesResponse.map((employees) =>
        employees.map((employee) => ({
          value: employee.id,
          label: `${employee.firstName ?? ''} ${employee.lastName ?? ''}${
            employee.email ? ` (${employee.email})` : ''
          }`
        }))
      )
    )
  }, [id, employeesResponse])

  return (
    <Container>
      <ContentArea opaque>
        <Gap size="xs" />
        {renderResult(
          combine(areas, unit, financeDecisionHandlerOptions),
          ([areas, unit, financeDecisionHandlerOptions]) => (
            <UnitEditor
              editable={editable}
              areas={areas}
              financeDecisionHandlerOptions={financeDecisionHandlerOptions}
              unit={unit.daycare}
              onClickEdit={useEditable.on}
            >
              {(getFormData, isValid) => (
                <>
                  <LegacyButton
                    onClick={useEditable.off}
                    text={i18n.common.cancel}
                  />
                  <LegacyMutateButton
                    primary
                    preventDefault
                    mutation={updateUnitMutation}
                    onClick={() => {
                      const body = getFormData()
                      return body ? { daycareId: id, body } : cancelMutation
                    }}
                    onSuccess={useEditable.off}
                    disabled={!isValid}
                    text={i18n.common.save}
                    data-qa="save-button"
                  />
                </>
              )}
            </UnitEditor>
          )
        )}
      </ContentArea>
    </Container>
  )
})
