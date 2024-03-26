import orderBy from 'lodash/orderBy'

import DateRange from 'lib-common/date-range'
import FiniteDateRange from 'lib-common/finite-date-range'
import { boolean, requiredLocalTimeRange, string } from 'lib-common/form/fields'
import { array, object, recursive, required, value } from 'lib-common/form/form'
import { Form } from 'lib-common/form/types'
import {
  CalendarEvent,
  IndividualChild
} from 'lib-common/generated/api-types/calendarevent'
import { UnitGroupDetails } from 'lib-common/generated/api-types/daycare'
import LocalDate from 'lib-common/local-date'
import { UUID } from 'lib-common/types'

export interface TreeNodeInfo {
  key: string
  text: string
  checked: boolean
  children: TreeNodeInfo[]
  firstName: string
  lastName: string
}

export const treeNodeInfo = (): Form<
  TreeNodeInfo,
  never,
  TreeNodeInfo,
  unknown
> =>
  object({
    text: string(),
    key: string(),
    checked: boolean(),
    children: array(recursive(treeNodeInfo)),
    firstName: string(),
    lastName: string()
  })

export const basicInfoForm = object({
  title: required(string()),
  description: required(string())
})

export const calendarEventTimeForm = object({
  id: value<UUID>(),
  childId: value<UUID | null>(),
  date: required(value<LocalDate>()),
  timeRange: required(requiredLocalTimeRange())
})

export const eventTimeArray = array(calendarEventTimeForm)

export const timesForm = object({
  times: eventTimeArray
})

export const attendeeForm = object({
  attendees: array(recursive(treeNodeInfo))
})

export const surveyForm = object({
  title: required(string()),
  description: required(string()),
  times: array(calendarEventTimeForm),
  attendees: array(recursive(treeNodeInfo))
})

const isChildSelected = (childId: string, selections: IndividualChild[]) =>
  selections.some((s) => s.id === childId)

export const filterAttendees = (
  groupData: UnitGroupDetails,
  groupId: UUID,
  eventData: CalendarEvent | null,
  period: FiniteDateRange
): TreeNodeInfo[] => {
  const { groups, placements } = groupData
  const currentGroup = groups.filter((g) => g.id === groupId)
  return currentGroup.map((g) => {
    // individualChildren contains childSelections that are not a part of a full group selection
    // -> any children there means their full group is not selected
    const invitedAttendees = {
      individualChildren: eventData?.individualChildren ?? [],
      groups: eventData?.groups ?? []
    }
    const individualChildrenOfSelectedGroup =
      invitedAttendees.individualChildren.filter((c) => c.groupId === groupId)
    const groupChildren = placements.filter((p) =>
      p.groupPlacements.some(
        (gp) =>
          gp.groupId === g.id &&
          period.overlaps(new DateRange(gp.startDate, gp.endDate))
      )
    )

    const sortedGroupChildren = orderBy(groupChildren, [
      ({ child }) => child.lastName,
      ({ child }) => child.firstName
    ]).map(({ child: c }) => ({
      key: c.id,
      text: `${c.firstName} ${c.lastName}`,
      checked:
        individualChildrenOfSelectedGroup.length === 0 ||
        isChildSelected(c.id, individualChildrenOfSelectedGroup),
      children: [],
      firstName: c.firstName,
      lastName: c.lastName
    }))

    // group is always selected:
    // - the full group is selected by default for a new survey
    // - existing survey has to have at least one attendee for the group -> tree node selected
    return {
      text: g.name,
      key: g.id,
      checked: true,
      children: sortedGroupChildren,
      firstName: '',
      lastName: ''
    }
  })
}

export const mergeAttendeeChanges = (
  groupData: UnitGroupDetails,
  prev: { attendees: TreeNodeInfo[] },
  period: FiniteDateRange,
  groupId: UUID,
  eventData: CalendarEvent | null
): TreeNodeInfo[] => {
  const previousGroupNode = prev.attendees[0]
  const previousChildren = previousGroupNode?.children ?? []
  const refreshedAttendeeTree = filterAttendees(
    groupData,
    groupId,
    eventData,
    period
  )

  if (
    previousChildren.length > 0 &&
    previousChildren.every((pc) => pc.checked)
  ) {
    return refreshedAttendeeTree
  } else {
    // merge past state with additions/removals from recalculated base selection
    const newGroupNode = refreshedAttendeeTree[0]
    const newChildren = newGroupNode?.children ?? []
    const addedChildren = newChildren
      .filter((ni) => !previousChildren.some((pi) => pi.key === ni.key))
      .map((c) => ({ ...c, checked: false }))
    const removedChildren = previousChildren.filter(
      (pi) => !newChildren.some((ni) => pi.key === ni.key)
    )

    const mergedGroupChildren = orderBy(
      [
        ...previousChildren.filter(
          (pi) => !removedChildren.some((ri) => ri === pi)
        ),
        ...addedChildren
      ],
      [(c) => c.lastName, (c) => c.firstName, (c) => c.key]
    )
    return [
      {
        ...previousGroupNode,
        checked: mergedGroupChildren.some((c) => c.checked),
        children: mergedGroupChildren
      }
    ]
  }
}
