// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import { useHistory } from 'react-router-dom'
import styled from 'styled-components'
import { Result } from 'lib-common/api'
import { formatDate } from 'lib-common/date'
import { formatCents } from 'lib-common/money'
import Pagination from 'lib-components/Pagination'
import Checkbox from 'lib-components/atoms/form/Checkbox'
import {
  SortableTh,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from 'lib-components/layout/Table'
import { H1 } from 'lib-components/typography'
import { SortByVoucherValueDecisions } from '../../api/invoicing'
import { useTranslation } from '../../state/i18n'
import { SearchOrder } from '../../types'
import { VoucherValueDecisionSummary } from '../../types/invoicing'
import { renderResult } from '../async-rendering'
import ChildrenCell from '../common/ChildrenCell'
import NameWithSsn from '../common/NameWithSsn'

const TitleRowContainer = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 1.5rem;
`

const ResultsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
`

interface Props {
  decisions?: Result<VoucherValueDecisionSummary[]>
  total?: number
  pages?: number
  currentPage: number
  setPage: (page: number) => void
  sortBy: SortByVoucherValueDecisions
  setSortBy: (v: SortByVoucherValueDecisions) => void
  sortDirection: SearchOrder
  setSortDirection: (v: SearchOrder) => void
  showCheckboxes: boolean
  checked: { [id: string]: boolean }
  toggleChecked: (id: string) => void
  checkAll: () => void
  clearChecked: () => void
}

export default React.memo(function VoucherValueDecisions({
  decisions,
  total,
  pages,
  currentPage,
  setPage,
  sortBy,
  setSortBy,
  sortDirection,
  setSortDirection,
  showCheckboxes,
  checked,
  toggleChecked,
  checkAll,
  clearChecked
}: Props) {
  const { i18n } = useTranslation()
  const history = useHistory()

  const allChecked =
    decisions
      ?.map((ds) => ds.length > 0 && ds.every((d) => checked[d.id]))
      .getOrElse(false) ?? false

  const isSorted = (column: SortByVoucherValueDecisions) =>
    sortBy === column ? sortDirection : undefined

  const toggleSort = (column: SortByVoucherValueDecisions) => () => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC')
    } else {
      setSortBy(column)
      setSortDirection('ASC')
    }
  }

  const rows = decisions?.isSuccess
    ? decisions.value.map((item) => {
        return (
          <Tr
            key={item.id}
            onClick={() => history.push(`/finance/value-decisions/${item.id}`)}
            data-qa="table-value-decision-row"
          >
            <Td>
              <NameWithSsn {...item.headOfFamily} i18n={i18n} />
            </Td>
            <Td>
              <ChildrenCell people={[item.child]} />
            </Td>
            <Td>{`${item.validFrom.format()} - ${
              item.validTo?.format() ?? ''
            }`}</Td>
            <Td>{formatCents(item.voucherValue)}</Td>
            <Td>{formatCents(item.finalCoPayment)}</Td>
            <Td>{item.decisionNumber}</Td>
            <Td>{formatDate(item.created)}</Td>
            <Td>{formatDate(item.sentAt)}</Td>
            <Td>{i18n.valueDecision.status[item.status]}</Td>
            {showCheckboxes ? (
              <Td onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  label={item.id}
                  hiddenLabel
                  checked={!!checked[item.id]}
                  onChange={() => toggleChecked(item.id)}
                  data-qa="toggle-decision"
                />
              </Td>
            ) : null}
          </Tr>
        )
      })
    : null

  return (
    <div className="value-decisions">
      <TitleRowContainer>
        <H1 noMargin>{i18n.valueDecisions.table.title}</H1>
        {decisions?.isSuccess && (
          <ResultsContainer>
            <div>{total ? i18n.common.resultCount(total) : null}</div>
            <Pagination
              pages={pages}
              currentPage={currentPage}
              setPage={setPage}
              label={i18n.common.page}
            />
          </ResultsContainer>
        )}
      </TitleRowContainer>
      <Table data-qa="table-of-decisions">
        <Thead>
          <Tr>
            <SortableTh
              sorted={isSorted('HEAD_OF_FAMILY')}
              onClick={toggleSort('HEAD_OF_FAMILY')}
            >
              {i18n.valueDecisions.table.head}
            </SortableTh>
            <Th>{i18n.valueDecisions.table.child}</Th>
            <Th>{i18n.valueDecisions.table.validity}</Th>
            <Th>{i18n.valueDecisions.table.totalValue}</Th>
            <Th>{i18n.valueDecisions.table.totalCoPayment}</Th>
            <Th>{i18n.valueDecisions.table.number}</Th>
            <Th>{i18n.valueDecisions.table.createdAt}</Th>
            <Th>{i18n.valueDecisions.table.sentAt}</Th>
            <SortableTh
              sorted={isSorted('STATUS')}
              onClick={toggleSort('STATUS')}
            >
              {i18n.valueDecisions.table.status}
            </SortableTh>
            {showCheckboxes && (!decisions || decisions.isSuccess) ? (
              <Td>
                <Checkbox
                  label="all"
                  hiddenLabel
                  checked={allChecked}
                  onChange={allChecked ? clearChecked : checkAll}
                  disabled={decisions?.isSuccess !== true}
                  data-qa="toggle-all-decisions"
                />
              </Td>
            ) : null}
          </Tr>
        </Thead>
        <Tbody>{rows}</Tbody>
      </Table>
      {decisions &&
        renderResult(decisions, () => (
          <ResultsContainer>
            <Pagination
              pages={pages}
              currentPage={currentPage}
              setPage={setPage}
              label={i18n.common.page}
            />
          </ResultsContainer>
        ))}
    </div>
  )
})
