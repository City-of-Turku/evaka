// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import orderBy from 'lodash/orderBy'
import React, { useCallback, useContext, useMemo, useState } from 'react'
import { Link } from 'react-router'
import styled from 'styled-components'

import { Result, Success, wrapResult } from 'lib-common/api'
import { PersonJSON } from 'lib-common/generated/api-types/pis'
import { ChildId, PersonId } from 'lib-common/generated/api-types/shared'
import { getAge } from 'lib-common/utils/local-date'
import { useApiState } from 'lib-common/utils/useRestApi'
import { StaticChip } from 'lib-components/atoms/Chip'
import { IconOnlyButton } from 'lib-components/atoms/buttons/IconOnlyButton'
import Checkbox from 'lib-components/atoms/form/Checkbox'
import { Table, Tbody, Td, Th, Thead, Tr } from 'lib-components/layout/Table'
import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'
import { AsyncFormModal } from 'lib-components/molecules/modals/FormModal'
import { H3, Label, P } from 'lib-components/typography'
import { defaultMargins } from 'lib-components/white-space'
import colors from 'lib-customizations/common'
import { faPen } from 'lib-icons'

import {
  getPersonGuardians,
  updateGuardianEvakaRights
} from '../../generated/api-clients/pis'
import { ChildContext } from '../../state'
import { useTranslation } from '../../state/i18n'
import { formatName } from '../../utils'
import { NameTd } from '../PersonProfile'
import { renderResult } from '../async-rendering'

const getPersonGuardiansResult = wrapResult(getPersonGuardians)
const updateGuardianEvakaRightsResult = wrapResult(updateGuardianEvakaRights)

export default React.memo(function Guardians() {
  const { i18n } = useTranslation()
  const { childId, permittedActions } = useContext(ChildContext)
  const [guardians, reloadGuardians] = useApiState(
    () =>
      childId && permittedActions.has('READ_GUARDIANS')
        ? getPersonGuardiansResult({ personId: childId })
        : Promise.resolve(
            Success.of({ guardians: [], blockedGuardians: null })
          ),
    [childId, permittedActions]
  )
  const allGuardians: Result<(PersonJSON & { evakaRightsDenied: boolean })[]> =
    guardians.map(({ guardians, blockedGuardians }) =>
      orderBy(
        guardians
          .map((g) => ({ ...g, evakaRightsDenied: false }))
          .concat(
            blockedGuardians?.map((g) => ({ ...g, evakaRightsDenied: true })) ??
              []
          ),
        ['lastName', 'firstName'],
        ['asc']
      )
    )

  const [editingEvakaRights, setEditingEvakaRights] = useState<PersonId>()

  const stopEditing = useCallback(() => setEditingEvakaRights(undefined), [])

  if (!childId) {
    return null
  }

  return (
    <>
      {!!editingEvakaRights && (
        <EditEvakaRightsModal
          childId={childId}
          guardianId={editingEvakaRights}
          denied={allGuardians
            .map(
              (guardians) =>
                guardians.find((g) => g.id === editingEvakaRights)
                  ?.evakaRightsDenied ?? false
            )
            .getOrElse(false)}
          stopEditing={stopEditing}
          reloadGuardians={reloadGuardians}
        />
      )}
      <H3 noMargin>{i18n.personProfile.guardians}</H3>
      {renderResult(allGuardians, (guardians, isReloading) => (
        <Table data-qa="table-of-guardians" data-loading={isReloading}>
          <Thead>
            <Tr>
              <Th>{i18n.personProfile.name}</Th>
              <Th>{i18n.personProfile.ssn}</Th>
              <Th>{i18n.personProfile.age}</Th>
              <Th>{i18n.personProfile.streetAddress}</Th>
              {permittedActions.has('UPDATE_EVAKA_RIGHTS') && (
                <Th>{i18n.personProfile.evakaRights.tableHeader}</Th>
              )}
            </Tr>
          </Thead>
          <Tbody>
            {guardians.map((guardian) => (
              <Tr
                key={guardian.id}
                data-qa={`table-guardian-row-${guardian.id}`}
              >
                <NameTd data-qa="guardian-name">
                  <Link to={`/profile/${guardian.id}`}>
                    {formatName(
                      guardian.firstName,
                      guardian.lastName,
                      i18n,
                      true
                    )}
                  </Link>
                </NameTd>
                <Td data-qa="guardian-ssn">{guardian.socialSecurityNumber}</Td>
                <Td data-qa="guardian-age">{getAge(guardian.dateOfBirth)}</Td>
                <Td data-qa="guardian-street-address">
                  {formatAddress(guardian)}
                </Td>
                {permittedActions.has('UPDATE_EVAKA_RIGHTS') && (
                  <Td>
                    <Toolbar>
                      <StaticChip
                        color={
                          guardian.evakaRightsDenied
                            ? colors.status.danger
                            : colors.accents.a3emerald
                        }
                        data-qa="evaka-rights-status"
                      >
                        {guardian.evakaRightsDenied
                          ? i18n.personProfile.evakaRights.statusDenied
                          : i18n.personProfile.evakaRights.statusAllowed}
                      </StaticChip>
                      <IconOnlyButton
                        icon={faPen}
                        aria-label={i18n.common.edit}
                        onClick={() => setEditingEvakaRights(guardian.id)}
                        disabled={!!editingEvakaRights}
                        data-qa="edit-guardian-evaka-rights"
                      />
                    </Toolbar>
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      ))}
    </>
  )
})

const Toolbar = styled.div`
  display: grid;
  grid: auto / min-content min-content;
  gap: ${defaultMargins.m};
  align-items: center;
`

const formatAddress = (guardian: PersonJSON) =>
  `${guardian.streetAddress}, ${guardian.postalCode} ${guardian.postOffice}`

const EditEvakaRightsModal = React.memo(function EditEvakaRightsModal({
  childId,
  guardianId,
  denied,
  stopEditing,
  reloadGuardians
}: {
  childId: ChildId
  guardianId: PersonId
  denied: boolean
  stopEditing: () => void
  reloadGuardians: () => void
}) {
  const { i18n } = useTranslation()
  const [contentState, setContentState] = useState<'info' | 'update'>('info')
  const [editState, setEditState] = useState(
    denied
      ? { confirmed: true, denied: true }
      : { confirmed: false, denied: false }
  )

  const update = useCallback(
    () =>
      updateGuardianEvakaRightsResult({
        childId,
        body: {
          guardianId,
          denied: editState.denied
        }
      }),
    [childId, guardianId, editState.denied]
  )

  const onSuccess = useCallback(() => {
    stopEditing()
    reloadGuardians()
  }, [stopEditing, reloadGuardians])

  const content = useMemo(
    () =>
      contentState === 'info'
        ? {
            resolve: () => setContentState('update'),
            resolveLabel: i18n.common.continue,
            resolveDisabled: false,
            onSuccess: () => undefined,
            children: <P>{i18n.personProfile.evakaRights.modalInfoParagraph}</P>
          }
        : {
            resolve: update,
            resolveLabel: i18n.common.confirm,
            resolveDisabled: denied
              ? editState.confirmed
              : !editState.confirmed,
            onSuccess,
            children: (
              <FixedSpaceColumn spacing="s">
                <Label>
                  {i18n.personProfile.evakaRights.modalUpdateSubtitle}
                </Label>
                <Checkbox
                  label={i18n.personProfile.evakaRights.confirmedLabel}
                  checked={editState.confirmed}
                  onChange={(confirmed) =>
                    setEditState((s) => ({ ...s, confirmed }))
                  }
                  disabled={editState.denied}
                  data-qa="confirmation"
                />
                <Checkbox
                  label={i18n.personProfile.evakaRights.deniedLabel}
                  checked={editState.denied}
                  onChange={(denied) => setEditState((s) => ({ ...s, denied }))}
                  disabled={!editState.confirmed}
                  data-qa="denied"
                />
              </FixedSpaceColumn>
            )
          },
    [i18n, denied, contentState, editState, update, onSuccess]
  )

  return (
    <AsyncFormModal
      title={i18n.personProfile.evakaRights.editModalTitle}
      resolveAction={content.resolve}
      resolveLabel={content.resolveLabel}
      resolveDisabled={content.resolveDisabled}
      onSuccess={content.onSuccess}
      rejectAction={stopEditing}
      rejectLabel={i18n.common.cancel}
      data-qa="evaka-rights-modal"
    >
      {content.children}
    </AsyncFormModal>
  )
})
