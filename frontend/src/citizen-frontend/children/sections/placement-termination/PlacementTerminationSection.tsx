// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useState } from 'react'

import type { ChildId } from 'lib-common/generated/api-types/shared'
import LocalDate from 'lib-common/local-date'
import { useQueryResult } from 'lib-common/query'
import { FixedSpaceColumn } from 'lib-components/layout/flex-helpers'
import { P } from 'lib-components/typography'
import { faLockAlt } from 'lib-icons'

import RequireAuth from '../../../RequireAuth'
import { renderResult } from '../../../async-rendering'
import { useUser } from '../../../auth/state'
import { useTranslation } from '../../../localization'
import ResponsiveWholePageCollapsible from '../../ResponsiveWholePageCollapsible'
import { getPlacementsQuery } from '../../queries'

import NonTerminatablePlacement from './NonTerminatablePlacement'
import PlacementTerminationForm from './PlacementTerminationForm'
import TerminatedPlacements from './TerminatedPlacements'

interface PlacementTerminationProps {
  childId: ChildId
}

export default React.memo(function PlacementTerminationSection({
  childId
}: PlacementTerminationProps) {
  const t = useTranslation()
  const [open, setOpen] = useState(false)
  const user = useUser()

  return (
    <ResponsiveWholePageCollapsible
      title={t.children.placementTermination.title}
      open={open}
      toggleOpen={() => setOpen(!open)}
      opaque
      data-qa="collapsible-termination"
      icon={user?.authLevel === 'WEAK' ? faLockAlt : undefined}
    >
      <RequireAuth>
        <PlacementTerminationContent childId={childId} />
      </RequireAuth>
    </ResponsiveWholePageCollapsible>
  )
})

const PlacementTerminationContent = React.memo(
  function PlacementTerminationContent({ childId }: PlacementTerminationProps) {
    const t = useTranslation()

    const getPlacementsResult = useQueryResult(getPlacementsQuery({ childId }))

    return (
      <>
        {renderResult(getPlacementsResult, ({ placements }) => {
          const terminatedPlacements = placements.filter((placementGroup) =>
            placementGroup.placements
              .concat(placementGroup.additionalPlacements)
              .find((placement) => !!placement.terminationRequestedDate)
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
      </>
    )
  }
)
