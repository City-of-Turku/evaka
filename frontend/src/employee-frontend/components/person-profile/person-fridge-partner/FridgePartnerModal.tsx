// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useState, useContext, useEffect, useMemo } from 'react'

import { Loading, Result } from 'lib-common/api'
import { UpdateStateFn } from 'lib-common/form-state'
import { Partnership, PersonSummary } from 'lib-common/generated/api-types/pis'
import LocalDate from 'lib-common/local-date'
import { UUID } from 'lib-common/types'
import DatePicker from 'lib-components/molecules/date-picker/DatePicker'
import FormModal from 'lib-components/molecules/modals/FormModal'
import { faPen, faUser } from 'lib-icons'

import { addPartnership, updatePartnership } from '../../../api/partnerships'
import { getPerson } from '../../../api/person'
import { DbPersonSearch as PersonSearch } from '../../../components/common/PersonSearch'
import { useTranslation } from '../../../state/i18n'
import { UIContext } from '../../../state/ui'
import { formatName } from '../../../utils'

interface Props {
  headPersonId: UUID
  onSuccess: () => void
  partnership?: Partnership
}

export interface FridgePartnerForm {
  partner?: PersonSummary
  startDate: LocalDate
  endDate: LocalDate | null
}

function FridgePartnerModal({ partnership, onSuccess, headPersonId }: Props) {
  const { i18n } = useTranslation()
  const { clearUiMode, setErrorMessage } = useContext(UIContext)
  const [personData, setPersonData] = useState<Result<PersonSummary>>(
    Loading.of()
  )
  const initialForm: FridgePartnerForm = {
    partner:
      partnership &&
      partnership.partners.find((partner) => partner.id !== headPersonId),
    startDate: partnership
      ? partnership.startDate
      : LocalDate.todayInSystemTz(),
    endDate: partnership ? partnership.endDate : null
  }
  const [form, setForm] = useState(initialForm)

  const validationErrors = useMemo(() => {
    const errors = []

    if (form.endDate && form.startDate.isAfter(form.endDate)) {
      errors.push(i18n.validationError.invertedDateRange)
    }

    if (
      form.partner?.dateOfDeath &&
      (!form.endDate || form.endDate.isAfter(form.partner.dateOfDeath))
    ) {
      errors.push(
        `${
          i18n.personProfile.fridgePartner.validation.deadPartner
        } (${form.partner.dateOfDeath.format()})`
      )
    }

    const headDateOfDeath = personData
      .map((p) => p.dateOfDeath)
      .getOrElse(undefined)

    if (
      headDateOfDeath &&
      (!form.endDate || form.endDate.isAfter(headDateOfDeath))
    ) {
      errors.push(
        `${
          i18n.personProfile.fridgePartner.validation.deadPerson
        } (${headDateOfDeath.format()})`
      )
    }

    return errors
  }, [i18n, personData, form])

  const [errorStatusCode, setErrorStatusCode] = useState<number>()

  useEffect(() => {
    void getPerson(headPersonId).then(setPersonData)
  }, [headPersonId, setPersonData])

  const onSubmit = () => {
    if (!form.partner) return

    const apiCall = partnership
      ? updatePartnership(partnership.id, form.startDate, form.endDate)
      : addPartnership(
          headPersonId,
          form.partner.id,
          form.startDate,
          form.endDate
        )

    void apiCall.then((res) => {
      if (res.isFailure) {
        setErrorStatusCode(res.statusCode)

        if (res.statusCode !== 409) {
          clearUiMode()
          setErrorMessage({
            type: 'error',
            title: partnership
              ? i18n.personProfile.fridgePartner.error.edit.title
              : i18n.personProfile.fridgePartner.error.add.title,
            text: i18n.common.tryAgain,
            resolveLabel: i18n.common.ok
          })
        }
      } else {
        clearUiMode()
        onSuccess()
      }
    })
  }

  const assignFridgePartnerForm: UpdateStateFn<FridgePartnerForm> = (
    values
  ) => {
    const mergedFridgePartner = { ...form, ...values }
    setForm(mergedFridgePartner)
  }

  return (
    <FormModal
      title={
        partnership
          ? i18n.personProfile.fridgePartner.editPartner
          : i18n.personProfile.fridgePartner.newPartner
      }
      icon={partnership ? faPen : faUser}
      type="info"
      resolveAction={onSubmit}
      resolveLabel={i18n.common.confirm}
      resolveDisabled={!form.partner || validationErrors.length > 0}
      rejectAction={clearUiMode}
      rejectLabel={i18n.common.cancel}
      data-qa="fridge-partner-modal"
    >
      {errorStatusCode === 409 && (
        <section className="error">
          {i18n.personProfile.fridgePartner.error.conflict}
        </section>
      )}
      <section>
        {partnership ? (
          <div>
            {form.partner
              ? `${formatName(
                  form.partner.firstName,
                  form.partner.lastName,
                  i18n,
                  true
                )} (${form.partner.socialSecurityNumber ?? ''})`
              : ''}
          </div>
        ) : (
          <>
            <div className="bold">
              {i18n.personProfile.fridgePartner.searchTitle}
            </div>
            <PersonSearch
              onResult={(person) =>
                assignFridgePartnerForm({ partner: person })
              }
              onlyAdults
              data-qa="fridge-partner-person-search"
            />
          </>
        )}
      </section>
      <section>
        <div className="bold" id="start-date">
          {i18n.common.form.startDate}
        </div>
        <DatePicker
          date={form.startDate}
          onChange={(startDate) =>
            startDate && assignFridgePartnerForm({ startDate })
          }
          fullWidth
          data-qa="fridge-partner-start-date"
          locale="fi"
          errorTexts={i18n.validationErrors}
          labels={i18n.common.datePicker}
          aria-labelledby="start-date"
        />
      </section>
      <section>
        <div className="bold">{i18n.common.form.endDate}</div>
        <DatePicker
          date={form.endDate}
          onChange={(endDate) => assignFridgePartnerForm({ endDate })}
          fullWidth
          locale="fi"
          errorTexts={i18n.validationErrors}
          labels={i18n.common.datePicker}
          aria-labelledby="start-date"
        />
        {validationErrors.map((error) => (
          <div className="error" key={error}>
            {error}
          </div>
        ))}
      </section>
    </FormModal>
  )
}

export default FridgePartnerModal
