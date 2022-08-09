// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useState } from 'react'

import LocalDate from 'lib-common/local-date'
import { UUID } from 'lib-common/types'
import { useApiState } from 'lib-common/utils/useRestApi'
import { CollapsibleContentArea } from 'lib-components/layout/Container'
import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'
import { H2, P } from 'lib-components/typography'

import { renderResult } from '../async-rendering'
import { useTranslation } from '../localization'

import NonTerminatablePlacement from './NonTerminatablePlacement'
import PlacementTerminationForm from './PlacementTerminationForm'
import TerminatedPlacements from './TerminatedPlacements'
import { getPlacements } from './api'

interface PlacementTerminationProps {
  childId: UUID
}

export default React.memo(function PlacementTerminationSection({
  childId
}: PlacementTerminationProps) {
  const t = useTranslation()
  const [placementsResponse, refreshPlacements] = useApiState(
    () => getPlacements(childId),
    [childId]
  )

  const [open, setOpen] = useState(false)

  return (
    <CollapsibleContentArea
      title={<H2>t.children.placementTermination.title</H2>}
      open={open}
      toggleOpen={() => setOpen(!open)}
      opaque
    >
      {renderResult(placementsResponse, ({ placements }) => {
        const terminatedPlacements = placements.filter((p) =>
          p.placements
            .concat(p.additionalPlacements)
            .find((p2) => !!p2.terminationRequestedDate)
        )
        const groups = placements.filter((p) =>
          p.endDate.isAfter(LocalDate.todayInSystemTz())
        )
        return (
          <FixedSpaceColumn>
            <P>{t.children.placementTermination.description}</P>
            {groups.map((grp) =>
              grp.terminatable ? (
                <PlacementTerminationForm
                  key={`${grp.type}-${grp.unitId}`}
                  childId={childId}
                  placementGroup={grp}
                  onSuccess={refreshPlacements}
                />
              ) : (
                <NonTerminatablePlacement
                  key={`${grp.type}-${grp.unitId}`}
                  group={grp}
                />
              )
            )}
            {terminatedPlacements.length > 0 && (
              <TerminatedPlacements placements={terminatedPlacements} />
            )}
          </FixedSpaceColumn>
        )
      })}
    </CollapsibleContentArea>
  )
})
