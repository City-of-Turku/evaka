// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'
import styled from 'styled-components'
import { faExternalLink } from 'lib-icons'
import { fontWeights } from '../typography'
import { defaultMargins } from '../white-space'

type ExternalLinkProps = {
  text: string
  href: string
  newTab?: boolean
}

export default React.memo(function ExternalLink({
  text,
  href,
  newTab
}: ExternalLinkProps) {
  return (
    <StyledLink
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noreferrer' : undefined}
    >
      <FontAwesomeIcon icon={faExternalLink} />
      <Text>{text}</Text>
    </StyledLink>
  )
})

const StyledLink = styled.a`
  text-decoration: none;
  display: inline-block;
  font-weight: ${fontWeights.semibold};
  font-size: 14px;
  line-height: 21px;
  color: ${({ theme: { colors } }) => colors.main.primary};
`

const Text = styled.span`
  margin-left: ${defaultMargins.xs};
`
