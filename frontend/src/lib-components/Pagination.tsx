// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import styled from 'styled-components'
import { fontWeights } from './typography'

const NUMBER_OF_PAGES_TO_SHOW = 5

const PageItem = styled.a`
  margin-left: 4px;
`

const PageSpacer = styled.span`
  margin-left: 4px;
`

const ActivePageItem = styled.span`
  margin-left: 4px;
  font-weight: ${fontWeights.semibold};
`

interface Props {
  pages: number | undefined
  currentPage: number
  setPage: (page: number) => void
  label: string
}

export default React.memo(function Pagination({
  pages = 0,
  currentPage,
  setPage,
  label
}: Props) {
  const firstPage = 1
  const lastPage = pages

  const tooManyPages = pages > NUMBER_OF_PAGES_TO_SHOW

  const firstPageToShow = tooManyPages
    ? Math.ceil(Math.max(currentPage - NUMBER_OF_PAGES_TO_SHOW / 2, firstPage))
    : firstPage

  const lastPageToShow = tooManyPages
    ? Math.ceil(Math.min(currentPage + NUMBER_OF_PAGES_TO_SHOW / 2, lastPage))
    : lastPage

  return (
    <div>
      <span>{label}:</span>

      {firstPageToShow > 1 && (
        <PageItem
          key={1}
          onClick={() => setPage(1)}
          data-qa={`page-selector-1`}
        >
          {1}
        </PageItem>
      )}

      {firstPageToShow > 2 && <PageSpacer>...</PageSpacer>}

      {[...Array(lastPageToShow + 1 - firstPageToShow).keys()]
        .map((index) => index + firstPageToShow)
        .map((index) =>
          index === currentPage ? (
            <ActivePageItem data-qa={`active-page-${index}`} key={index}>
              {index}
            </ActivePageItem>
          ) : (
            <PageItem
              key={index}
              onClick={() => setPage(index)}
              data-qa={`page-selector-${index}`}
            >
              {index}
            </PageItem>
          )
        )}

      {lastPageToShow < lastPage - 1 && <PageSpacer>...</PageSpacer>}

      {lastPageToShow < lastPage && (
        <PageItem
          key={lastPage}
          onClick={() => setPage(lastPage)}
          data-qa={`page-selector-${lastPage}`}
        >
          {lastPage}
        </PageItem>
      )}
    </div>
  )
})
