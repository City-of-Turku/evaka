// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { faPen, faQuestion, faTrash } from 'Icons'
import React, { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import { PreschoolTerm } from 'lib-common/generated/api-types/daycare'
import LocalDate from 'lib-common/local-date'
import { useMutationResult, useQueryResult } from 'lib-common/query'
import { UUID } from 'lib-common/types'
import AddButton from 'lib-components/atoms/buttons/AddButton'
import IconButton from 'lib-components/atoms/buttons/IconButton'
import { Table, Tbody, Td, Th, Thead, Tr } from 'lib-components/layout/Table'
import { FixedSpaceRow } from 'lib-components/layout/flex-helpers'
import { AsyncFormModal } from 'lib-components/molecules/modals/FormModal'
import InfoModal from 'lib-components/molecules/modals/InfoModal'
import { H2 } from 'lib-components/typography'
import { Gap } from 'lib-components/white-space'
import { featureFlags } from 'lib-customizations/employeeMobile'

import { useTranslation } from '../../state/i18n'
import { renderResult } from '../async-rendering'

import { deletePreschoolTermMutation, preschoolTermsQuery } from './queries'

const Ul = styled.ul`
  margin: 0;
`

export default React.memo(function TermsSection() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()

  const [termToEdit, setTermToEdit] = useState<UUID>()
  const [showEditModal, setShowEditModal] = useState(false)

  const [termToDelete, setTermToDelete] = useState<UUID>()
  const [showDeletionModal, setShowDeletionModal] = useState(false)

  const preschoolTerms = useQueryResult(preschoolTermsQuery())

  const { mutateAsync: deletePreschoolTerm } = useMutationResult(
    deletePreschoolTermMutation
  )

  const onDeletePreschoolTerm = useCallback(
    (termId: UUID) => {
      setTermToDelete(termId)
      setShowDeletionModal(true)
    },
    [setTermToDelete, setShowDeletionModal]
  )

  const deletePreschoolTermHandle = useCallback(
    () => (termToDelete ? deletePreschoolTerm(termToDelete) : Promise.reject()),
    [termToDelete, deletePreschoolTerm]
  )

  const onCloseDeletionModal = useCallback(() => {
    setTermToDelete(undefined)
    setShowDeletionModal(false)
  }, [setTermToDelete, setShowDeletionModal])

  const onEditTermHandle = useCallback(
    (term: PreschoolTerm) => {
      if (term.finnishPreschool.start.isBefore(LocalDate.todayInSystemTz())) {
        setTermToEdit(term.id)
        setShowEditModal(true)
      } else {
        navigate(`/holiday-periods/preschool-term/${term.id}`)
      }
    },
    [setShowEditModal, navigate]
  )

  const onCloseEditModal = useCallback(() => {
    setTermToEdit(undefined)
    setShowEditModal(false)
  }, [setShowEditModal, setTermToEdit])

  const navigateToNewTerm = useCallback(() => {
    navigate('/holiday-periods/preschool-term/new')
  }, [navigate])

  const closeModalAndNavigateToEditTerm = useCallback(() => {
    if (termToEdit) {
      navigate(`/holiday-periods/preschool-term/${termToEdit}`)
    }
  }, [navigate, termToEdit])

  return (
    <>
      <H2>{i18n.titles.preschoolTerms}</H2>
      <AddButton
        onClick={navigateToNewTerm}
        text={i18n.terms.addTerm}
        data-qa="add-preschool-term-button"
      />

      <Gap size="m" />

      {renderResult(preschoolTerms, (preschoolTerms) => (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>{i18n.terms.finnishPreschool}</Th>
                {featureFlags.extendedPreschoolTerm && (
                  <Th>{i18n.terms.extendedTermStart}</Th>
                )}
                <Th>{i18n.terms.applicationPeriodStart}</Th>
                <Th>{i18n.terms.termBreaks}</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {preschoolTerms
                .sort((a, b) =>
                  b.finnishPreschool.start.compareTo(a.finnishPreschool.start)
                )
                .map((row, i) => (
                  <Tr key={i} data-qa="preschool-term-row">
                    <Td data-qa="finnish-preschool">
                      {row.finnishPreschool.format('dd.MM.yyyy')}
                    </Td>
                    {featureFlags.extendedPreschoolTerm && (
                      <Td data-qa="extended-term-start">
                        {row.extendedTerm.start.format('dd.MM.yyyy')}
                      </Td>
                    )}
                    <Td data-qa="application-period-start">
                      {row.applicationPeriod.start.format('dd.MM.yyyy')}
                    </Td>
                    <Td data-qa="term-breaks">
                      <Ul>
                        {row.termBreaks.map((termBreak, i) => (
                          <li
                            data-qa={`term-break-${termBreak.start.formatIso()}`}
                            key={`term-break-${i}`}
                          >
                            {termBreak.formatCompact()}
                          </li>
                        ))}
                      </Ul>
                    </Td>
                    <Td>
                      <FixedSpaceRow spacing="s">
                        <IconButton
                          icon={faPen}
                          data-qa="btn-edit"
                          onClick={() => onEditTermHandle(row)}
                          aria-label={i18n.common.edit}
                        />
                        {row.finnishPreschool.start.isAfter(
                          LocalDate.todayInSystemTz()
                        ) && (
                          <IconButton
                            icon={faTrash}
                            data-qa="btn-delete"
                            onClick={() => onDeletePreschoolTerm(row.id)}
                            aria-label={i18n.common.edit}
                          />
                        )}
                      </FixedSpaceRow>
                    </Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
          {showEditModal ? (
            <InfoModal
              icon={faQuestion}
              type="danger"
              title={i18n.terms.modals.editTerm.title}
              text={i18n.terms.modals.editTerm.text}
              reject={{
                action: onCloseEditModal,
                label: i18n.terms.modals.editTerm.reject
              }}
              resolve={{
                action: closeModalAndNavigateToEditTerm,
                label: i18n.terms.modals.editTerm.resolve
              }}
            />
          ) : null}
          {showDeletionModal && (
            <AsyncFormModal
              icon={faQuestion}
              title={i18n.terms.modals.deleteTerm.title}
              text={i18n.terms.modals.deleteTerm.text}
              type="warning"
              resolveAction={deletePreschoolTermHandle}
              resolveLabel={i18n.terms.modals.deleteTerm.resolve}
              onSuccess={onCloseDeletionModal}
              rejectAction={onCloseDeletionModal}
              rejectLabel={i18n.terms.modals.deleteTerm.reject}
              data-qa="deletion-modal"
            />
          )}
        </>
      ))}
    </>
  )
})
