// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo
} from 'react'

import { Loading, Result } from 'lib-common/api'
import {
  CitizenUserDetails,
  UserDetailsResponse
} from 'lib-common/generated/api-types/pis'
import { CitizenAuthLevel } from 'lib-common/generated/api-types/shared'
import { idleTracker } from 'lib-common/utils/idleTracker'
import { useApiState } from 'lib-common/utils/useRestApi'

import { client } from '../api-client'

import { getAuthStatus } from './api'

export interface User extends CitizenUserDetails {
  authLevel: CitizenAuthLevel
}

type AuthState = {
  apiVersion: string | undefined
  user: Result<User | undefined>
  fullUserResponse: Result<UserDetailsResponse | undefined>
  refreshAuthStatus: () => void
}

const defaultState: AuthState = {
  apiVersion: undefined,
  user: Loading.of(),
  fullUserResponse: Loading.of(),
  refreshAuthStatus: () => undefined
}

export const AuthContext = createContext<AuthState>(defaultState)

export const AuthContextProvider = React.memo(function AuthContextProvider({
  children
}: {
  children: ReactNode
}) {
  const [authStatus, refreshAuthStatus] = useApiState(getAuthStatus, [])

  useEffect(
    () => idleTracker(client, refreshAuthStatus, { thresholdInMinutes: 20 }),
    [refreshAuthStatus]
  )

  const value = useMemo(
    () => ({
      apiVersion: authStatus.map((a) => a.apiVersion).getOrElse(undefined),
      user: authStatus.map((a) =>
        a.loggedIn
          ? { ...a.user.details, authLevel: a.user.authLevel }
          : undefined
      ),
      fullUserResponse: authStatus.map((a) =>
        a.loggedIn ? a.user : undefined
      ),
      refreshAuthStatus
    }),
    [authStatus, refreshAuthStatus]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
})

export const useUser = (): User | undefined => {
  const authContext = useContext(AuthContext)
  const full = authContext.fullUserResponse.getOrElse(undefined)
  return useMemo(
    () => full && { ...full.details, authLevel: full.authLevel },
    [full]
  )
}
