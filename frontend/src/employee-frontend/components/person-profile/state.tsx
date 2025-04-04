// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { createContext, useMemo } from 'react'

import { Loading, Result } from 'lib-common/api'
import { Action } from 'lib-common/generated/action'
import {
  FamilyOverview,
  ParentshipWithPermittedActions,
  PersonJSON
} from 'lib-common/generated/api-types/pis'
import { PersonId } from 'lib-common/generated/api-types/shared'
import { pendingQuery, useQueryResult } from 'lib-common/query'

import { familyByPersonQuery, parentshipsQuery, personQuery } from './queries'

export interface PersonState {
  person: Result<PersonJSON>
  permittedActions: Set<Action.Person>
  family: Result<FamilyOverview>
  fridgeChildren: Result<ParentshipWithPermittedActions[]>
}

const defaultState: PersonState = {
  person: Loading.of(),
  permittedActions: new Set(),
  family: Loading.of(),
  fridgeChildren: Loading.of()
}

const emptyPermittedActions = new Set<Action.Person>()

export const PersonContext = createContext<PersonState>(defaultState)

export const PersonContextProvider = React.memo(function PersonContextProvider({
  id,
  children
}: {
  id: PersonId
  children: React.JSX.Element
}) {
  const personResponse = useQueryResult(personQuery({ personId: id }))

  const person = useMemo(
    () => personResponse.map((response) => response.person),
    [personResponse]
  )
  const permittedActions = useMemo(
    () =>
      personResponse
        .map(({ permittedActions }) => new Set(permittedActions))
        .getOrElse(emptyPermittedActions),
    [personResponse]
  )

  const family = useQueryResult(
    permittedActions.has('READ_FAMILY_OVERVIEW')
      ? familyByPersonQuery({ id })
      : pendingQuery<FamilyOverview>()
  )

  const fridgeChildren = useQueryResult(
    permittedActions.has('READ_PARENTSHIPS')
      ? parentshipsQuery({ headOfChildId: id })
      : pendingQuery<ParentshipWithPermittedActions[]>()
  )

  const value = useMemo<PersonState>(
    () => ({
      person,
      permittedActions,
      family,
      fridgeChildren
    }),
    [person, permittedActions, family, fridgeChildren]
  )

  return (
    <PersonContext.Provider value={value}>{children}</PersonContext.Provider>
  )
})
