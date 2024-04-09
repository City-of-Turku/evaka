// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import styled from 'styled-components'

import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'

import BottomNavbar, { BottomNavbarProps } from './BottomNavbar'
import TopBarWithGroupSelector, {
  TopBarWithGroupSelectorProps
} from './TopBarWithGroupSelector'

const FlexibleDiv = styled.div`
  flex-grow: 1;
  display: block;
  overflow: auto;
`

type PageWithNavigation = BottomNavbarProps &
  Omit<TopBarWithGroupSelectorProps, 'unitId'> & {
    children: React.ReactNode
  }

export const PageWithNavigation: React.FC<PageWithNavigation> = ({
  selectedGroupId,
  selected,
  onChangeGroup,
  toggleSearch,
  selectedGroup,
  countInfo,
  includeSelectAll = true,
  allowedGroupIds = undefined,
  children
}) => (
  <FixedSpaceColumn spacing="zero" style={{ height: '100vh' }}>
    <TopBarWithGroupSelector
      unitId={selectedGroupId.unitId}
      onChangeGroup={onChangeGroup}
      toggleSearch={toggleSearch}
      selectedGroup={selectedGroup}
      countInfo={countInfo}
      includeSelectAll={includeSelectAll}
      allowedGroupIds={allowedGroupIds}
    />
    <FlexibleDiv>{children}</FlexibleDiv>
    <BottomNavbar selected={selected} selectedGroupId={selectedGroupId} />
  </FixedSpaceColumn>
)
