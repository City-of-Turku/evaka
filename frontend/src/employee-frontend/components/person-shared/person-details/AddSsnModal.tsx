// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useContext, useEffect, useState } from 'react'
import styled from 'styled-components'

import { wrapResult } from 'lib-common/api'
import { PersonJSON } from 'lib-common/generated/api-types/pis'
import { PersonId } from 'lib-common/generated/api-types/shared'
import InputField from 'lib-components/atoms/form/InputField'
import FormModal from 'lib-components/molecules/modals/FormModal'
import colors from 'lib-customizations/common'

import { addSsn } from '../../../generated/api-clients/pis'
import { useTranslation } from '../../../state/i18n'
import { UIContext } from '../../../state/ui'
import { isSsnValid } from '../../../utils/validation/validations'

const addSsnResult = wrapResult(addSsn)

const Error = styled.div`
  display: flex;
  justify-content: center;
  color: ${colors.status.danger};
  margin: 20px;
`

interface Props {
  personId: PersonId
  onUpdateComplete?: (data: PersonJSON) => void
}

function AddSsnModal({ personId, onUpdateComplete }: Props) {
  const { i18n } = useTranslation()
  const { clearUiMode } = useContext(UIContext)
  const [ssn, setSsn] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<'invalid' | 'conflict' | 'unknown'>()

  useEffect(() => {
    setError(undefined)
  }, [ssn])

  const submit = () => {
    let isMounted = true
    setSubmitting(true)
    void addSsnResult({ personId, body: { ssn } })
      .then((result) => {
        if (result.isSuccess) {
          if (onUpdateComplete) onUpdateComplete(result.value)
          clearUiMode()
          isMounted = false
        } else if (result.isFailure) {
          if (result.statusCode === 400) {
            setError('invalid')
          } else if (result.statusCode === 409) {
            setError('conflict')
          } else {
            setError('unknown')
          }
        }
      })
      .catch(() => setError('unknown'))
      .finally(() => isMounted && setSubmitting(false))
  }

  return (
    <FormModal
      title={i18n.personProfile.addSsn}
      resolveAction={submit}
      resolveLabel={i18n.common.confirm}
      resolveDisabled={submitting || !isSsnValid(ssn.toUpperCase())}
      rejectAction={clearUiMode}
      rejectLabel={i18n.common.cancel}
    >
      <InputField
        value={ssn}
        onChange={(value) => setSsn(value)}
        data-qa="ssn-input"
      />
      <Error>
        {error === 'invalid'
          ? i18n.personProfile.ssnInvalid
          : error === 'conflict'
            ? i18n.personProfile.ssnConflict
            : error === 'unknown'
              ? i18n.common.error.unknown
              : ''}
      </Error>
    </FormModal>
  )
}

export default AddSsnModal
