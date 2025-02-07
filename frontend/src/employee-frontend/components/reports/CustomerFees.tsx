// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import sortBy from 'lodash/sortBy'
import uniqBy from 'lodash/uniqBy'
import React, { useMemo } from 'react'
import styled from 'styled-components'

import { localDate } from 'lib-common/form/fields'
import { object, oneOf, required } from 'lib-common/form/form'
import { useForm, useFormFields } from 'lib-common/form/hooks'
import { ProviderType } from 'lib-common/generated/api-types/daycare'
import {
  FinanceDecisionType,
  financeDecisionTypes
} from 'lib-common/generated/api-types/invoicing'
import { AreaId, DaycareId } from 'lib-common/generated/api-types/shared'
import LocalDate from 'lib-common/local-date'
import { formatCents } from 'lib-common/money'
import { constantQuery, useQueryResult } from 'lib-common/query'
import Title from 'lib-components/atoms/Title'
import ReturnButton from 'lib-components/atoms/buttons/ReturnButton'
import { SelectF } from 'lib-components/atoms/dropdowns/Select'
import { Container, ContentArea } from 'lib-components/layout/Container'
import { Table, Tbody, Td, Th, Thead, Tr } from 'lib-components/layout/Table'
import { DatePickerF } from 'lib-components/molecules/date-picker/DatePicker'
import { unitProviderTypes } from 'lib-customizations/employee'

import ReportDownload from '../../components/reports/ReportDownload'
import { useTranslation } from '../../state/i18n'
import { renderResult } from '../async-rendering'
import { unitsQuery } from '../unit/queries'

import { FilterLabel, FilterRow } from './common'
import { customerFeesReportQuery } from './queries'

const filterForm = object({
  date: required(localDate()),
  areaId: oneOf<AreaId>(),
  unitId: oneOf<DaycareId>(),
  providerType: oneOf<ProviderType>(),
  decisionType: required(oneOf<FinanceDecisionType>())
})

const CustomerFeesInner = React.memo(function CustomerFeesInner({
  unitOptions,
  areaOptions
}: {
  unitOptions: { id: DaycareId; name: string }[]
  areaOptions: { id: AreaId; name: string }[]
}) {
  const { i18n, lang } = useTranslation()

  const filters = useForm(
    filterForm,
    () => ({
      date: localDate.fromDate(LocalDate.todayInSystemTz()),
      areaId: {
        domValue: '',
        options: areaOptions.map(({ id, name }) => ({
          value: id,
          domValue: id,
          label: name
        }))
      },
      unitId: {
        domValue: '',
        options: unitOptions.map(({ id, name }) => ({
          value: id,
          domValue: id,
          label: name
        }))
      },
      providerType: {
        domValue: '' as const,
        options: unitProviderTypes.map((t) => ({
          value: t,
          domValue: t,
          label: i18n.common.providerType[t]
        }))
      },
      decisionType: {
        domValue: 'FEE_DECISION' as const,
        options: financeDecisionTypes.map((t) => ({
          value: t,
          domValue: t,
          label: i18n.reports.customerFees.types[t]
        }))
      }
    }),
    i18n.validationErrors
  )
  const { date, unitId, areaId, providerType, decisionType } =
    useFormFields(filters)

  const rowsResult = useQueryResult(
    filters.isValid()
      ? customerFeesReportQuery(filters.value())
      : constantQuery([])
  )

  const sortedRows = useMemo(
    () => rowsResult.map((rows) => sortBy(rows, [(row) => row.feeAmount])),
    [rowsResult]
  )

  return (
    <Container>
      <ReturnButton label={i18n.common.goBack} />
      <ContentArea opaque>
        <Title size={1}>{i18n.reports.customerFees.title}</Title>

        <FilterRow>
          <FilterLabel>{i18n.reports.customerFees.date}</FilterLabel>
          <DatePickerF bind={date} locale={lang} />
        </FilterRow>
        <FilterRow>
          <FilterLabel>{i18n.reports.customerFees.area}</FilterLabel>
          <SelectF bind={areaId} placeholder={i18n.common.select} />
        </FilterRow>
        <FilterRow>
          <FilterLabel>{i18n.reports.customerFees.unit}</FilterLabel>
          <SelectF bind={unitId} placeholder={i18n.common.select} />
        </FilterRow>
        <FilterRow>
          <FilterLabel>{i18n.reports.customerFees.providerType}</FilterLabel>
          <SelectF bind={providerType} placeholder={i18n.common.select} />
        </FilterRow>
        <FilterRow>
          <FilterLabel>{i18n.reports.customerFees.type}</FilterLabel>
          <SelectF bind={decisionType} />
        </FilterRow>

        {renderResult(sortedRows, (rows) => (
          <>
            <ReportDownload
              data={rows.map((row) => ({
                ...row,
                feeAmount: formatCents(row.feeAmount, true)
              }))}
              headers={[
                {
                  label: i18n.reports.customerFees.fee,
                  key: 'feeAmount'
                },
                {
                  label: i18n.reports.customerFees.count,
                  key: 'count'
                }
              ]}
              filename={
                filters.isValid()
                  ? `${i18n.reports.customerFees.title} ${i18n.reports.customerFees.types[decisionType.value()].toLowerCase()} ${areaId.value() ? `${areaOptions.find((a) => a.id === areaId.value())?.name ?? ''} ` : ''}${unitId.value() ? `${unitOptions.find((u) => u.id === unitId.value())?.name ?? ''} ` : ''}${filters.value().date.formatIso()}.csv`
                  : ''
              }
            />
            <NarrowerTable>
              <Thead>
                <Tr>
                  <Th>{i18n.reports.customerFees.fee}</Th>
                  <Th>{i18n.reports.customerFees.count}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((row) => (
                  <Tr data-qa="customer-fees-row" key={row.feeAmount}>
                    <Td>{formatCents(row.feeAmount, true)} €</Td>
                    <Td>{row.count}</Td>
                  </Tr>
                ))}
                <Tr>
                  <Td>{i18n.reports.common.total}</Td>
                  <Td>{rows.reduce((acc, row) => acc + row.count, 0)}</Td>
                </Tr>
              </Tbody>
            </NarrowerTable>
          </>
        ))}
      </ContentArea>
    </Container>
  )
})

const NarrowerTable = styled(Table)`
  max-width: 400px;
`

export default React.memo(function CustomerFees() {
  const unitsResult = useQueryResult(unitsQuery({ includeClosed: false }))
  return renderResult(unitsResult, (units) => (
    <CustomerFeesInner
      unitOptions={sortBy(
        units.map((unit) => ({ id: unit.id, name: unit.name })),
        ({ name }) => name
      )}
      areaOptions={sortBy(
        uniqBy(
          units.map((unit) => ({ id: unit.area.id, name: unit.area.name })),
          ({ id }) => id
        ),
        ({ name }) => name
      )}
    />
  ))
})
