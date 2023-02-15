// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import isEqual from 'lodash/isEqual'
import orderBy from 'lodash/orderBy'
import React, { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'

import { SortDirection } from 'lib-common/generated/api-types/invoicing'
import { ManualDuplicationReportRow } from 'lib-common/generated/api-types/reports'
import { useApiState } from 'lib-common/utils/useRestApi'
import Title from 'lib-components/atoms/Title'
import ReturnButton from 'lib-components/atoms/buttons/ReturnButton'
import { Container, ContentArea } from 'lib-components/layout/Container'
import {
  Th,
  Tr,
  Td,
  Thead,
  Tbody,
  SortableTh
} from 'lib-components/layout/Table'

import { getManualDuplicationReport } from '../../api/reports'
import { useTranslation } from '../../state/i18n'
import { renderResult } from '../async-rendering'

import { TableScrollable } from './common'

type ReportColumnKey = keyof ManualDuplicationReportRow

const WrappableTd = styled(Td)`
  white-space: normal;
  min-width: 80px;
`

export default React.memo(function ManualDuplicationReport() {
  const { i18n } = useTranslation()

  const [reportResult] = useApiState(getManualDuplicationReport, [])

  const [sortColumns, setSortColumns] = useState<ReportColumnKey[]>([
    'connectedDaycareName',
    'childLastName',
    'childFirstName'
  ])
  const [sortDirection, setSortDirection] = useState<SortDirection>('ASC')

  const sortBy = useCallback(
    (columns: ReportColumnKey[]) => {
      if (isEqual(sortColumns, columns)) {
        setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC')
      } else {
        setSortColumns(columns)
        setSortDirection('ASC')
      }
    },
    [sortColumns, sortDirection]
  )

  const sortedReportResult = useMemo(
    () =>
      reportResult.map((rows) =>
        orderBy(rows, sortColumns, [sortDirection === 'ASC' ? 'asc' : 'desc'])
      ),
    [reportResult, sortColumns, sortDirection]
  )

  return (
    <Container>
      <ReturnButton label={i18n.common.goBack} />
      <ContentArea opaque>
        <Title size={1}>{i18n.reports.manualDuplication.title}</Title>
        {renderResult(sortedReportResult, (reportRows) => (
          <TableScrollable>
            <Thead>
              <Tr>
                <Th>{i18n.reports.manualDuplication.childName}</Th>
                <Th>{i18n.reports.manualDuplication.dateOfBirth}</Th>
                <SortableTh
                  sorted={
                    isEqual(sortColumns, [
                      'connectedDaycareName',
                      'childLastName',
                      'childFirstName'
                    ])
                      ? sortDirection
                      : undefined
                  }
                  onClick={() =>
                    sortBy([
                      'connectedDaycareName',
                      'childLastName',
                      'childFirstName'
                    ])
                  }
                >
                  {i18n.reports.manualDuplication.connectedDaycare}
                </SortableTh>
                <Th>{i18n.reports.manualDuplication.connectedSno}</Th>
                <Th>{i18n.reports.manualDuplication.connectedDuration}</Th>

                <SortableTh
                  sorted={
                    isEqual(sortColumns, [
                      'preschoolDaycareName',
                      'childLastName',
                      'childFirstName'
                    ])
                      ? sortDirection
                      : undefined
                  }
                  onClick={() =>
                    sortBy([
                      'preschoolDaycareName',
                      'childLastName',
                      'childFirstName'
                    ])
                  }
                >
                  {i18n.reports.manualDuplication.preschoolDaycare}
                </SortableTh>
                <Th>{i18n.reports.manualDuplication.preschooldDuration}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {reportRows.map((row: ManualDuplicationReportRow) => (
                <Tr key={row.childId}>
                  <WrappableTd>
                    <Link
                      target="_blank"
                      to={`/child-information/${row.childId}`}
                    >
                      {`${row.childLastName}, ${row.childFirstName}`}
                    </Link>
                  </WrappableTd>
                  <WrappableTd>{row.dateOfBirth.format()}</WrappableTd>
                  <WrappableTd>
                    <Link
                      target="_blank"
                      to={`/units/${row.connectedDaycareId}`}
                    >
                      {row.connectedDaycareName}
                    </Link>
                  </WrappableTd>

                  <WrappableTd>{row.connectedSnoName}</WrappableTd>
                  <WrappableTd>{`${row.connectedStartDate.format()} - ${row.connectedEndDate.format()}`}</WrappableTd>

                  <WrappableTd>
                    <Link
                      target="_blank"
                      to={`/units/${row.preschoolDaycareId}`}
                    >
                      {row.preschoolDaycareName}
                    </Link>
                  </WrappableTd>
                  <WrappableTd>{`${row.preschoolStartDate.format()} - ${row.preschoolEndDate.format()}`}</WrappableTd>
                </Tr>
              ))}
            </Tbody>
          </TableScrollable>
        ))}
      </ContentArea>
    </Container>
  )
})