// SPDX-FileCopyrightText: 2017-2023 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'

import { VardaChildErrorReportRow } from 'lib-common/generated/api-types/reports'
import HelsinkiDateTime from 'lib-common/helsinki-date-time'
import LocalDate from 'lib-common/local-date'
import { useQueryResult } from 'lib-common/query'
import Title from 'lib-components/atoms/Title'
import { LegacyMutateButton } from 'lib-components/atoms/buttons/LegacyMutateButton'
import ReturnButton from 'lib-components/atoms/buttons/ReturnButton'
import { Container, ContentArea } from 'lib-components/layout/Container'
import { Tbody, Td, Th, Thead, Tr } from 'lib-components/layout/Table'
import { FixedSpaceRow } from 'lib-components/layout/flex-helpers'
import ExpandingInfo from 'lib-components/molecules/ExpandingInfo'
import { Gap } from 'lib-components/white-space'

import { useTranslation } from '../../state/i18n'
import { renderResult } from '../async-rendering'

import { TableScrollable } from './common'
import {
  resetVardaChildMutation,
  startVardaResetMutation,
  startVardaUpdateMutation,
  vardaChildErrorsQuery
} from './queries'

const FlatList = styled.ul`
  list-style: none;
  padding-left: 0;
  margin-top: 0;
`

export default React.memo(function VardaChildErrors() {
  const { i18n } = useTranslation()
  const vardaErrorsResult = useQueryResult(vardaChildErrorsQuery())

  const ageInDays = (timestamp: HelsinkiDateTime): number =>
    LocalDate.todayInHelsinkiTz().differenceInDays(timestamp.toLocalDate())

  return (
    <Container>
      <ReturnButton label={i18n.common.goBack} />
      <ContentArea opaque>
        <Title size={1}>{i18n.reports.vardaChildErrors.title}</Title>
        <ExpandingInfo
          data-qa="varda-expanding-info"
          info={i18n.reports.vardaChildErrors.vardaInfo}
        >
          <FixedSpaceRow>
            <LegacyMutateButton
              primary
              text={i18n.reports.vardaChildErrors.vardaUpdateButton}
              mutation={startVardaUpdateMutation}
              onClick={() => true}
              data-qa="varda-update-button"
            />
            <LegacyMutateButton
              primary
              text={i18n.reports.vardaChildErrors.vardaResetButton}
              mutation={startVardaResetMutation}
              onClick={() => true}
              data-qa="varda-reset-button"
            />
          </FixedSpaceRow>
        </ExpandingInfo>

        <Gap size="xxs" />
        {renderResult(vardaErrorsResult, (rows) => (
          <>
            <TableScrollable data-qa="varda-errors-table">
              <Thead>
                <Tr>
                  <Th>{i18n.reports.vardaChildErrors.age}</Th>
                  <Th>{i18n.reports.vardaChildErrors.child}</Th>
                  <Th>{i18n.reports.vardaChildErrors.error}</Th>
                  <Th>{i18n.reports.vardaChildErrors.serviceNeed}</Th>
                  <Th>{i18n.reports.vardaChildErrors.updated}</Th>
                  <Th>{i18n.reports.vardaChildErrors.childLastReset}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((row: VardaChildErrorReportRow) => (
                  <Tr data-qa="varda-error-row" key={row.serviceNeedId}>
                    <Td data-qa={`age-${row.childId}`}>
                      {ageInDays(row.created)}
                    </Td>
                    <Td data-qa={`child-${row.childId}`}>
                      <Link to={`/child-information/${row.childId}`}>
                        {row.childId}
                      </Link>
                    </Td>

                    <Td data-qa={`errors-${row.childId}`}>
                      <BreakAll>{row.errors.join('\n')}</BreakAll>
                    </Td>
                    <Td>
                      <FlatList>
                        <li>{row.serviceNeedOptionName}</li>
                        <li>{row.serviceNeedValidity?.format()}</li>
                        <li>{row.serviceNeedId}</li>
                      </FlatList>
                    </Td>
                    <Td data-qa={`updated-${row.childId}`}>
                      {row.updated.format()}
                    </Td>
                    <Td data-qa={`last-reset-${row.childId}`}>
                      <>
                        <span>
                          {row.resetTimeStamp
                            ? row.resetTimeStamp.format()
                            : ''}
                        </span>
                        <LegacyMutateButton
                          primary
                          text={i18n.reports.vardaChildErrors.resetChild}
                          mutation={resetVardaChildMutation}
                          onClick={() => ({ childId: row.childId })}
                          data-qa={`reset-button-${row.childId}`}
                        />
                      </>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </TableScrollable>
          </>
        ))}
      </ContentArea>
    </Container>
  )
})

const BreakAll = styled.span`
  word-break: break-all;
`
