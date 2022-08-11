// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'

import useNonNullableParams from 'lib-common/useNonNullableParams'
import { useApiState } from 'lib-common/utils/useRestApi'
import Main from 'lib-components/atoms/Main'
import ReturnButton from 'lib-components/atoms/buttons/ReturnButton'
import Container, { ContentArea } from 'lib-components/layout/Container'
import { Gap } from 'lib-components/white-space'

import Footer from '../Footer'
import { renderResult } from '../async-rendering'
import { useTranslation } from '../localization'

import AssistanceNeedSection from './AssistanceNeedSection'
import ChildConsentsSection from './ChildConsentsSection'
import ChildHeader from './ChildHeader'
import PlacementTerminationSection from './PlacementTerminationSection'
import { getChild } from './api'

export default React.memo(function ChildPage() {
  const t = useTranslation()
  const { childId } = useNonNullableParams<{ childId: string }>()
  const [childResponse] = useApiState(() => getChild(childId), [childId])

  return (
    <>
      <Main>
        <Container>
          <ReturnButton label={t.common.return} />
          <Gap size="s" />
          {renderResult(childResponse, (child) => (
            <>
              <ContentArea opaque>
                <ChildHeader child={child} />
              </ContentArea>
              <Gap size="s" />
              <ChildConsentsSection childId={childId} />
              <Gap size="s" />
              <AssistanceNeedSection childId={childId} />
              <Gap size="s" />
              <PlacementTerminationSection childId={childId} />
            </>
          ))}
        </Container>
      </Main>
      <Footer />
    </>
  )
})
