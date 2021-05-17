// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useMemo, createContext } from 'react'
import { useTranslation } from '../state/i18n'

export interface TitleState {
  setTitle: (title: string | undefined) => void
  formatTitleName: (firstName: string | null, lastName: string | null) => string
}

const defaultState = {
  setTitle: () => undefined,
  formatTitleName: () => ''
}

export const TitleContext = createContext<TitleState>(defaultState)

export const TitleContextProvider = React.memo(function TitleContextProvider({
  children
}: {
  children: JSX.Element
}) {
  const { i18n } = useTranslation()

  // TODO fix the deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setTitle = (title?: string) => {
    document.title = title
      ? `${title} - ${i18n.titles.defaultTitle}`
      : i18n.titles.defaultTitle
  }

  // TODO fix the deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const formatTitleName = (
    maybeFirstName: string | null,
    maybeLastName: string | null
  ): string => {
    const firstName = maybeFirstName || i18n.common.noFirstName
    const lastName = maybeLastName || i18n.common.noLastName
    return firstName && lastName
      ? `${lastName} ${firstName}`
      : lastName
      ? lastName
      : firstName
  }

  const value = useMemo(
    () => ({
      setTitle: setTitle,
      formatTitleName: formatTitleName
    }),
    [setTitle, formatTitleName]
  )

  return <TitleContext.Provider value={value}>{children}</TitleContext.Provider>
})
