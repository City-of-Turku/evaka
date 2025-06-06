// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import styled from 'styled-components'
import { useLocation } from 'wouter'

import { useQuery } from 'lib-common/query'
import { desktopMin, desktopMinPx } from 'lib-components/breakpoints'
import colors from 'lib-customizations/common'

import { useUser } from '../auth/state'
import { unreadMessagesCountQuery } from '../messages/queries'

import CityLogo from './CityLogo'
import DesktopNav from './DesktopNav'
import EvakaLogo from './EvakaLogo'
import { headerHeightDesktop, headerHeightMobile } from './const'
import { LanguageMenu } from './shared-components'
import { useUnreadDecisions } from './utils'

export default React.memo(function Header(props: { ariaHidden: boolean }) {
  const loggedIn = useUser() !== undefined

  const { data: unreadMessagesCount } = useQuery(unreadMessagesCountQuery(), {
    enabled: loggedIn
  })

  const unreadDecisions = useUnreadDecisions()

  const [path] = useLocation()
  const isLoginPage = path === '/login'

  return (
    <>
      <HeaderContainer aria-hidden={props.ariaHidden}>
        <CityLogo />
        <EvakaLogo />
        {isLoginPage && (
          <MobileOnly>
            <LanguageMenu useShortLanguageLabel alignRight />
          </MobileOnly>
        )}
        <DesktopNav
          unreadMessagesCount={unreadMessagesCount ?? 0}
          unreadDecisions={unreadDecisions}
          hideLoginButton={isLoginPage}
        />
      </HeaderContainer>
    </>
  )
})

const HeaderContainer = styled.header`
  z-index: 25;
  color: ${colors.grayscale.g100};
  background-color: ${colors.grayscale.g0};
  display: grid;
  grid: minmax(60px, min-content) / repeat(3, minmax(100px, 1fr));
  height: ${headerHeightMobile}px;
  width: 100%;
  margin: 0 auto;
  position: sticky;
  top: 0;
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.15);

  @media (min-width: ${desktopMin}) {
    position: static;
    grid:
      minmax(${headerHeightDesktop}px, min-content)
      / max-content max-content auto;
    height: ${headerHeightDesktop}px;
    background-color: transparent;
    box-shadow: none;
  }

  @media screen and (min-width: 1152px) and (max-width: 1215px) {
    max-width: 1152px;
    width: 1152px;
  }
  @media screen and (min-width: 1216px) {
    max-width: 1152px;
    width: 1152px;
  }
  @media screen and (min-width: 1408px) {
    max-width: 1344px;
    width: 1344px;
  }
  @media print {
    display: none;
  }
`

const MobileOnly = styled.div`
  display: none;

  @media (max-width: ${desktopMinPx - 1}px) {
    display: block;
    padding: 4px;
  }
`
