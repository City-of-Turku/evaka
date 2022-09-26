// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'

import Main from 'lib-components/atoms/Main'

import MapView from './MapView'

export default React.memo(function MapPage() {
  return (
    <Main>
      <MapView />
    </Main>
  )
})
