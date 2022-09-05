// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import styled from 'styled-components'

import LinkWrapperInlineBlock from 'lib-components/atoms/LinkWrapperInlineBlock'
import Main from 'lib-components/atoms/Main'
import LinkButton from 'lib-components/atoms/buttons/LinkButton'
import Container, { ContentArea } from 'lib-components/layout/Container'
import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'
import {
  MobileOnly,
  TabletAndDesktop
} from 'lib-components/layout/responsive-layout'
import {
  ExpandingInfoBox,
  InfoButton
} from 'lib-components/molecules/ExpandingInfo'
import { fontWeights, H1, H2, P } from 'lib-components/typography'
import { defaultMargins, Gap } from 'lib-components/white-space'
import { farMap } from 'lib-icons'

import Footer from './Footer'
import { useUser } from './auth/state'
import { getStrongLoginUriWithPath, getWeakLoginUri } from './header/const'
import { useTranslation } from './localization'

const ParagraphInfoButton = styled(InfoButton)`
  margin-left: ${defaultMargins.xs};
`

/**
 * Ensures that the redirect URL will not contain any host
 * information, only the path/search params/hash.
 */
const getSafeNextPath = (nextParam: string | null) => {
  if (nextParam === null) {
    return null
  }

  const url = new URL(nextParam, window.location.origin)

  return `${url.pathname}${url.search}${url.hash}`
}

export default React.memo(function LoginPage() {
  const i18n = useTranslation()
  const user = useUser()

  const [searchParams] = useSearchParams()

  const nextPath = useMemo(
    () => getSafeNextPath(searchParams.get('next')),
    [searchParams]
  )

  const [showInfoBoxText, setShowInfoBoxText] = useState(false)

  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <Main>
      <TabletAndDesktop>
        <Gap size="L" />
      </TabletAndDesktop>
      <MobileOnly>
        <Gap size="xs" />
      </MobileOnly>
      <Container>
        <FixedSpaceColumn spacing="s">
          <ContentArea opaque>
            <H1 noMargin>{i18n.loginPage.title}</H1>
          </ContentArea>
          <ContentArea opaque>
            <H2 noMargin>{i18n.loginPage.login.title}</H2>
            <Gap size="m" />
            <P noMargin>{i18n.loginPage.login.paragraph}</P>
            <Gap size="s" />
            <LinkButton
              href={getWeakLoginUri(nextPath ?? '/')}
              data-qa="weak-login"
            >
              {i18n.loginPage.login.link}
            </LinkButton>
          </ContentArea>
          <ContentArea opaque>
            <H2 noMargin>{i18n.loginPage.applying.title}</H2>
            <Gap size="m" />
            <P noMargin>
              {i18n.loginPage.applying.paragraph}
              <ParagraphInfoButton
                aria-label={i18n.common.openExpandingInfo}
                onClick={() => setShowInfoBoxText(!showInfoBoxText)}
                open={showInfoBoxText}
              />
            </P>
            {showInfoBoxText && (
              <ExpandingInfoBox
                info={i18n.loginPage.applying.infoBoxText}
                close={() => setShowInfoBoxText(false)}
                closeLabel={i18n.common.close}
              />
            )}
            <ul>
              {i18n.loginPage.applying.infoBullets.map((item, index) => (
                <li key={`bullet-item-${index}`}>{item}</li>
              ))}
            </ul>
            <Gap size="s" />
            <LinkButton
              href={getStrongLoginUriWithPath(nextPath ?? '/applications')}
              data-qa="strong-login"
            >
              {i18n.loginPage.applying.link}
            </LinkButton>
            <Gap size="m" />
            <P noMargin>{i18n.loginPage.applying.mapText}</P>
            <Gap size="xs" />
            <MapLink to="/map">
              <FontAwesomeIcon icon={farMap} />
              <Gap size="xs" horizontal />
              {i18n.loginPage.applying.mapLink}
            </MapLink>
          </ContentArea>
        </FixedSpaceColumn>
      </Container>
      <Footer />
    </Main>
  )
})

const MapLink = styled(LinkWrapperInlineBlock)`
  font-weight: ${fontWeights.semibold};
`
