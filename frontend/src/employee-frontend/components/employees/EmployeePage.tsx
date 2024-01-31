// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { faPlus, faTimes, faTrash } from 'Icons'
import sortBy from 'lodash/sortBy'
import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { globalRoles } from 'lib-common/api-types/employee-auth'
import { array, value } from 'lib-common/form/form'
import { useForm } from 'lib-common/form/hooks'
import { EmployeeWithDaycareRoles } from 'lib-common/generated/api-types/pis'
import { UserRole } from 'lib-common/generated/api-types/shared'
import { useQueryResult } from 'lib-common/query'
import { UUID } from 'lib-common/types'
import useNonNullableParams from 'lib-common/useNonNullableParams'
import Title from 'lib-components/atoms/Title'
import Button from 'lib-components/atoms/buttons/Button'
import InlineButton from 'lib-components/atoms/buttons/InlineButton'
import MutateButton from 'lib-components/atoms/buttons/MutateButton'
import ReturnButton from 'lib-components/atoms/buttons/ReturnButton'
import Checkbox from 'lib-components/atoms/form/Checkbox'
import { Container, ContentArea } from 'lib-components/layout/Container'
import { Table, Tbody, Td, Th, Thead, Tr } from 'lib-components/layout/Table'
import {
  FixedSpaceColumn,
  FixedSpaceRow
} from 'lib-components/layout/flex-helpers'
import { ConfirmedMutation } from 'lib-components/molecules/ConfirmedMutation'
import { Gap } from 'lib-components/white-space'

import { useTranslation } from '../../state/i18n'
import { renderResult } from '../async-rendering'
import { FlexRow } from '../common/styled/containers'

import {
  deleteEmployeeDaycareRolesMutation,
  employeeDetailsQuery,
  updateEmployeeGlobalRolesMutation
} from './queries'

const globalRolesForm = array(value<UserRole>())

const GlobalRolesForm = React.memo(function GlobalRolesForm({
  employee,
  onSuccess,
  onCancel
}: {
  employee: EmployeeWithDaycareRoles
  onSuccess: () => void
  onCancel: () => void
}) {
  const { i18n } = useTranslation()
  const boundForm = useForm(
    globalRolesForm,
    () => employee.globalRoles,
    i18n.validationError
  )

  return (
    <FixedSpaceColumn spacing="m">
      <FixedSpaceColumn spacing="xs">
        {globalRoles.map((role) => (
          <Checkbox
            key={role}
            label={i18n.roles.adRoles[role]}
            checked={boundForm.value().includes(role)}
            onChange={(checked) => {
              if (checked) {
                boundForm.update((prev) => [
                  ...prev.filter((r) => r !== role),
                  role
                ])
              } else {
                boundForm.update((prev) => prev.filter((r) => r !== role))
              }
            }}
          />
        ))}
      </FixedSpaceColumn>
      <FixedSpaceRow>
        <Button text={i18n.common.cancel} onClick={onCancel} />
        <MutateButton
          primary
          text={i18n.common.save}
          mutation={updateEmployeeGlobalRolesMutation}
          onClick={() => ({ id: employee.id, globalRoles: boundForm.value() })}
          onSuccess={onSuccess}
        />
      </FixedSpaceRow>
    </FixedSpaceColumn>
  )
})

const EmployeePage = React.memo(function EmployeePage({
  employee
}: {
  employee: EmployeeWithDaycareRoles
}) {
  const { i18n } = useTranslation()
  const [editingGlobalRoles, setEditingGlobalRoles] = useState(false)

  const sortedRoles = useMemo(
    () => sortBy(employee.daycareRoles, ({ daycareName }) => daycareName),
    [employee.daycareRoles]
  )

  return (
    <Container>
      <ReturnButton label={i18n.common.goBack} />
      <ContentArea opaque>
        <Title size={2}>
          {employee.firstName} {employee.lastName}
        </Title>
        <span>{employee.email}</span>

        <Gap />

        <Title size={3}>{i18n.employees.editor.globalRoles}</Title>
        {editingGlobalRoles ? (
          <GlobalRolesForm
            employee={employee}
            onSuccess={() => setEditingGlobalRoles(false)}
            onCancel={() => setEditingGlobalRoles(false)}
          />
        ) : (
          <FixedSpaceColumn spacing="m">
            <div>
              {employee.globalRoles.length > 0
                ? globalRoles
                    .filter((r) => employee.globalRoles.includes(r))
                    .map((r) => i18n.roles.adRoles[r])
                    .join(', ')
                : '-'}
            </div>
            <InlineButton
              onClick={() => setEditingGlobalRoles(true)}
              text={i18n.common.edit}
            />
          </FixedSpaceColumn>
        )}

        <Gap />

        <Title size={3}>{i18n.employees.editor.unitRoles.title}</Title>
        <FlexRow justifyContent="space-between">
          <InlineButton
            onClick={() => {
              // TODO
            }}
            text={i18n.employees.editor.unitRoles.addRoles}
            icon={faPlus}
          />
          <ConfirmedMutation
            buttonStyle="INLINE"
            buttonText={i18n.employees.editor.unitRoles.deleteAll}
            icon={faTimes}
            confirmationTitle={i18n.employees.editor.unitRoles.deleteAllConfirm}
            mutation={deleteEmployeeDaycareRolesMutation}
            onClick={() => ({ employeeId: employee.id, daycareId: null })}
          />
        </FlexRow>
        <Table>
          <Thead>
            <Tr>
              <Th>{i18n.employees.editor.unitRoles.unit}</Th>
              <Th>{i18n.employees.editor.unitRoles.roles}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {sortedRoles.map(({ daycareId, daycareName, role }) => (
              <Tr key={`${daycareId}/${role}`}>
                <Td>
                  <Link to={`units/${daycareId}`}>{daycareName}</Link>
                </Td>
                <Td>{i18n.roles.adRoles[role]}</Td>
                <Td>
                  <ConfirmedMutation
                    buttonStyle="ICON"
                    icon={faTrash}
                    buttonAltText={i18n.common.remove}
                    confirmationTitle={
                      i18n.employees.editor.unitRoles.deleteConfirm
                    }
                    mutation={deleteEmployeeDaycareRolesMutation}
                    onClick={() => ({
                      employeeId: employee.id,
                      daycareId: daycareId
                    })}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </ContentArea>
    </Container>
  )
})

export default React.memo(function EmployeePageLoader() {
  const { i18n } = useTranslation()
  const { id } = useNonNullableParams<{ id: UUID }>()
  const employee = useQueryResult(employeeDetailsQuery(id))

  return (
    <Container>
      <ReturnButton label={i18n.common.goBack} />
      <ContentArea opaque>
        {renderResult(employee, (employee) => (
          <EmployeePage employee={employee} />
        ))}
      </ContentArea>
    </Container>
  )
})
