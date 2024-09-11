// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useState } from 'react'
import styled from 'styled-components'

import { useQueryResult } from 'lib-common/query'
import { useDebounce } from 'lib-common/utils/useDebounce'
import Pagination from 'lib-components/Pagination'
import Title from 'lib-components/atoms/Title'
import Checkbox from 'lib-components/atoms/form/Checkbox'
import InputField from 'lib-components/atoms/form/InputField'
import { Container, ContentArea } from 'lib-components/layout/Container'
import { FixedSpaceRow } from 'lib-components/layout/flex-helpers'
import { defaultMargins } from 'lib-components/white-space'
import { faSearch } from 'lib-icons'

import { useTranslation } from '../../state/i18n'
import { renderResult } from '../async-rendering'

import { EmployeeList } from './EmployeeList'
import { searchEmployeesQuery } from './queries'

const TopBar = styled.section`
  display: flex;
  justify-content: space-between;
  margin-bottom: ${defaultMargins.s};
`

const SearchBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`

const PaginationContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
`

export default React.memo(function EmployeesPage() {
  const { i18n } = useTranslation()
  const [page, setPage] = useState<number>(1)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [hideDeactivated, setHideDeactivated] = useState<boolean>(false)

  const debouncedSearchTerm = useDebounce(searchTerm, 500)

  const employees = useQueryResult(
    searchEmployeesQuery({
      body: {
        page,
        searchTerm: debouncedSearchTerm,
        hideDeactivated
      }
    })
  )

  return (
    <Container>
      <ContentArea opaque>
        <Title>{i18n.titles.employees}</Title>
        <TopBar>
          <SearchBar>
            <FixedSpaceRow>
              <InputField
                data-qa="employee-name-filter"
                value={searchTerm}
                placeholder={i18n.employees.findByName}
                onChange={(s) => {
                  setSearchTerm(s)
                  setPage(1)
                }}
                icon={faSearch}
                width="L"
              />

              <Checkbox
                label={i18n.employees.hideDeactivated}
                checked={hideDeactivated}
                onChange={(enabled) => {
                  setHideDeactivated(enabled)
                  setPage(1)
                }}
                data-qa="hide-deactivated-checkbox"
              />
            </FixedSpaceRow>
          </SearchBar>
          <PaginationContainer>
            <div>
              {employees.isSuccess
                ? i18n.common.resultCount(employees.value.total)
                : null}
            </div>
            <Pagination
              pages={employees.map((res) => res.pages).getOrElse(1)}
              currentPage={page}
              setPage={setPage}
              label={i18n.common.page}
            />
          </PaginationContainer>
        </TopBar>
        {renderResult(employees, (employees) => (
          <EmployeeList employees={employees.data} />
        ))}
        {employees?.isSuccess && (
          <PaginationContainer>
            <Pagination
              pages={employees.value.pages}
              currentPage={page}
              setPage={setPage}
              label={i18n.common.page}
            />
          </PaginationContainer>
        )}
      </ContentArea>
    </Container>
  )
})
