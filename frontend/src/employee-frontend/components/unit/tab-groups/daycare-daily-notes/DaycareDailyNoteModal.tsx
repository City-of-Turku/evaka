// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useState } from 'react'
import {
  DaycareDailyNote,
  DaycareDailyNoteBody,
  DaycareDailyNoteReminder
} from 'lib-common/generated/api-types/messaging'
import {
  deleteDaycareDailyNote,
  insertDaycareDailyNoteForChild,
  updateDaycareDailyNoteForChild,
  upsertDaycareDailyNoteForGroup
} from '../../../../api/daycare-daily-notes'
import { useTranslation } from '../../../../state/i18n'
import { faExclamation, faTrash } from 'lib-icons'
import { formatName } from '../../../../utils'
import LocalDate from 'lib-common/local-date'
import FormModal from 'lib-components/molecules/modals/FormModal'
import {
  FixedSpaceColumn,
  FixedSpaceRow
} from 'lib-components/layout/flex-helpers'
import IconButton from 'lib-components/atoms/buttons/IconButton'
import InputField from 'lib-components/atoms/form/InputField'
import TextArea from 'lib-components/atoms/form/TextArea'
import Checkbox from 'lib-components/atoms/form/Checkbox'
import Radio from 'lib-components/atoms/form/Radio'

interface DaycareDailyNoteFormData
  extends Omit<DaycareDailyNoteBody, 'sleepingMinutes'> {
  sleepingHours: string
  sleepingMinutes: string
}

const initialFormData = (
  note: DaycareDailyNote | null,
  childId: string | null,
  groupId: string | null
): DaycareDailyNoteFormData => {
  return note != null
    ? {
        ...note,
        childId,
        groupId,
        sleepingHours: note.sleepingMinutes
          ? Math.floor(Number(note.sleepingMinutes) / 60).toString()
          : '',
        sleepingMinutes: note.sleepingMinutes
          ? Math.round(Number(note.sleepingMinutes) % 60).toString()
          : ''
      }
    : {
        childId,
        groupId,
        date: LocalDate.today(),
        reminders: [],
        feedingNote: null,
        note: null,
        reminderNote: null,
        sleepingHours: '',
        sleepingMinutes: '',
        sleepingNote: null
      }
}

const formDataToRequestBody = (
  form: DaycareDailyNoteFormData
): DaycareDailyNoteBody => ({
  childId: form.childId,
  date: form.date,
  feedingNote: form.feedingNote,
  groupId: form.groupId,
  note: form.note,
  reminderNote: form.reminderNote,
  reminders: form.reminders,
  sleepingMinutes:
    form.sleepingHours || form.sleepingMinutes
      ? 60 * (parseInt(form.sleepingHours) || 0) +
        (parseInt(form.sleepingMinutes) || 0)
      : null,
  sleepingNote: form.sleepingNote
})

interface Props {
  note: DaycareDailyNote | null
  childId: string | null
  groupId: string | null
  childFirstName: string
  childLastName: string
  groupNote: string | null
  onClose: () => void
  reload: () => void
}

export default React.memo(function DaycareDailyNoteModal({
  note,
  childId,
  groupId,
  childFirstName,
  childLastName,
  groupNote,
  onClose,
  reload
}: Props) {
  const { i18n } = useTranslation()

  const [form, setForm] = useState<DaycareDailyNoteFormData>(
    initialFormData(note, childId, groupId)
  )

  const updateForm = <K extends keyof DaycareDailyNoteFormData>(
    updates: Pick<DaycareDailyNoteFormData, K>
  ) => {
    setForm({ ...form, ...updates })
  }

  const [submitting, setSubmitting] = useState(false)

  const submit = () => {
    // TODO error handling
    setSubmitting(true)
    const body = formDataToRequestBody(form)
    const closeAndReload = () => {
      onClose()
      reload()
    }
    if (childId != null) {
      const promise = note?.id
        ? updateDaycareDailyNoteForChild(childId, note.id, body)
        : insertDaycareDailyNoteForChild(childId, body)
      void promise.then(closeAndReload).finally(() => setSubmitting(false))
    } else if (groupId != null) {
      void upsertDaycareDailyNoteForGroup(groupId, {
        id: note?.id || null,
        ...body
      })
        .then(closeAndReload)
        .finally(() => setSubmitting(false))
    }
  }

  const deleteNote = async (event: React.MouseEvent) => {
    event.preventDefault()
    if (note?.id) await deleteDaycareDailyNote(note.id)
    onClose()
    reload()
  }

  const toggleReminder = (reminder: DaycareDailyNoteReminder) => {
    const reminders = form.reminders.some((r) => r == reminder)
      ? form.reminders.filter((r) => r != reminder)
      : [...form.reminders, reminder]
    updateForm({ reminders })
  }

  return groupId !== null ? (
    <FormModal
      data-qa={'daycare-daily-group-note-modal'}
      title={i18n.unit.groups.daycareDailyNote.groupNoteHeader}
      icon={faExclamation}
      iconColour={'blue'}
      resolve={{
        action: () => {
          submit()
        },
        disabled: submitting,
        label: i18n.common.confirm
      }}
      reject={{
        action: () => {
          onClose()
        },
        label: i18n.common.cancel
      }}
    >
      <FixedSpaceColumn>
        <FixedSpaceColumn alignItems={'center'} fullWidth={true}>
          <FixedSpaceRow
            fullWidth={true}
            justifyContent={'flex-end'}
            spacing={'s'}
          >
            <IconButton
              icon={faTrash}
              onClick={deleteNote}
              data-qa={'btn-delete-note'}
            />
            <span>{i18n.common.remove}</span>
          </FixedSpaceRow>
        </FixedSpaceColumn>
        <FixedSpaceColumn alignItems={'left'} fullWidth={true} spacing={'L'}>
          <FixedSpaceColumn>
            <div className="bold">
              {i18n.unit.groups.daycareDailyNote.groupNotesHeader}
            </div>
            <TextArea
              value={form.note || ''}
              placeholder={i18n.unit.groups.daycareDailyNote.groupNoteHint}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                updateForm({ note: e.target.value })
              }
              data-qa="group-note-input"
            />
          </FixedSpaceColumn>
        </FixedSpaceColumn>
      </FixedSpaceColumn>
    </FormModal>
  ) : (
    <FormModal
      data-qa={'daycare-daily-note-modal'}
      title={i18n.unit.groups.daycareDailyNote.header}
      icon={faExclamation}
      iconColour={'blue'}
      resolve={{
        action: () => {
          submit()
        },
        label: i18n.common.confirm,
        disabled: Number(form.sleepingMinutes) > 59 || submitting
      }}
      reject={{
        action: () => {
          onClose()
        },
        label: i18n.common.cancel
      }}
    >
      <FixedSpaceColumn>
        <FixedSpaceColumn alignItems={'center'} fullWidth={true}>
          <FixedSpaceRow>
            {formatName(childFirstName, childLastName, i18n)}
          </FixedSpaceRow>
          <FixedSpaceRow
            fullWidth={true}
            justifyContent={'flex-end'}
            spacing={'s'}
          >
            <IconButton icon={faTrash} onClick={deleteNote} />
            <span>{i18n.common.remove}</span>
          </FixedSpaceRow>
        </FixedSpaceColumn>
        <FixedSpaceColumn alignItems={'left'} fullWidth={true} spacing={'L'}>
          <FixedSpaceColumn>
            <div className="bold">
              {i18n.unit.groups.daycareDailyNote.notesHeader}
            </div>
            <TextArea
              value={form.note || ''}
              placeholder={i18n.unit.groups.daycareDailyNote.notesHint}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                updateForm({ note: e.target.value })
              }
              data-qa="note-input"
            />
          </FixedSpaceColumn>

          <FixedSpaceColumn>
            <div className="bold">
              {i18n.unit.groups.daycareDailyNote.feedingHeader}
            </div>
            <Radio
              checked={form.feedingNote == 'GOOD'}
              label={i18n.unit.groups.daycareDailyNote.level.GOOD}
              onChange={() => updateForm({ feedingNote: 'GOOD' })}
              data-qa={'feeding-level-good'}
            />
            <Radio
              checked={form.feedingNote == 'MEDIUM'}
              label={i18n.unit.groups.daycareDailyNote.level.MEDIUM}
              onChange={() => updateForm({ feedingNote: 'MEDIUM' })}
              data-qa={'feeding-level-medium'}
            />
            <Radio
              checked={form.feedingNote == 'NONE'}
              label={i18n.unit.groups.daycareDailyNote.level.NONE}
              onChange={() => updateForm({ feedingNote: 'NONE' })}
              data-qa={'feeding-level-none'}
            />
          </FixedSpaceColumn>

          <FixedSpaceColumn>
            <div className="bold">
              {i18n.unit.groups.daycareDailyNote.sleepingHeader}
            </div>
            <Radio
              checked={form.sleepingNote == 'GOOD'}
              label={i18n.unit.groups.daycareDailyNote.level.GOOD}
              onChange={() => updateForm({ sleepingNote: 'GOOD' })}
              data-qa={'sleeping-level-good'}
            />
            <Radio
              checked={form.sleepingNote == 'MEDIUM'}
              label={i18n.unit.groups.daycareDailyNote.level.MEDIUM}
              onChange={() => updateForm({ sleepingNote: 'MEDIUM' })}
              data-qa={'sleeping-level-medium'}
            />
            <Radio
              checked={form.sleepingNote == 'NONE'}
              label={i18n.unit.groups.daycareDailyNote.level.NONE}
              onChange={() => updateForm({ sleepingNote: 'NONE' })}
              data-qa={'sleeping-level-none'}
            />
          </FixedSpaceColumn>

          <FixedSpaceRow
            fullWidth={true}
            justifyContent={'flex-start'}
            spacing={'s'}
          >
            <InputField
              type={'number'}
              placeholder={i18n.unit.groups.daycareDailyNote.sleepingHoursHint}
              value={form.sleepingHours || ''}
              onChange={(value) => updateForm({ sleepingHours: value })}
              data-qa="sleeping-hours-input"
            />
            <span>{i18n.unit.groups.daycareDailyNote.sleepingHours}</span>
            <InputField
              type={'number'}
              placeholder={
                i18n.unit.groups.daycareDailyNote.sleepingMinutesHint
              }
              value={form.sleepingMinutes || ''}
              onChange={(value) => updateForm({ sleepingMinutes: value })}
              data-qa="sleeping-minutes-input"
              info={
                Number(form.sleepingMinutes) > 59
                  ? {
                      text: i18n.common.error.minutes,
                      status: 'warning'
                    }
                  : undefined
              }
            />
            <span>{i18n.unit.groups.daycareDailyNote.sleepingMinutes}</span>
          </FixedSpaceRow>

          <FixedSpaceColumn>
            <div className="bold">
              {i18n.unit.groups.daycareDailyNote.reminderHeader}
            </div>
            <Checkbox
              label={i18n.unit.groups.daycareDailyNote.reminderType.DIAPERS}
              checked={
                form.reminders.some((reminder) => reminder == 'DIAPERS') ||
                false
              }
              onChange={() => toggleReminder('DIAPERS')}
              data-qa="checkbox-diapers"
            />
            <Checkbox
              label={i18n.unit.groups.daycareDailyNote.reminderType.CLOTHES}
              checked={
                form.reminders.some((reminder) => reminder == 'CLOTHES') ||
                false
              }
              onChange={() => toggleReminder('CLOTHES')}
              data-qa="checkbox-clothes"
            />
            <Checkbox
              label={i18n.unit.groups.daycareDailyNote.reminderType.LAUNDRY}
              checked={
                form.reminders.some((reminder) => reminder == 'LAUNDRY') ||
                false
              }
              onChange={() => toggleReminder('LAUNDRY')}
              data-qa="checkbox-laundry"
            />
          </FixedSpaceColumn>

          <TextArea
            type={'text'}
            placeholder={
              i18n.unit.groups.daycareDailyNote.otherThingsToRememberHeader
            }
            value={form.reminderNote || ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              updateForm({ reminderNote: e.target.value })
            }
            data-qa="reminder-note-input"
          />

          {groupNote && (
            <FixedSpaceColumn>
              <div className="bold">
                {i18n.unit.groups.daycareDailyNote.groupNotesHeader}
              </div>
              <p data-qa={'group-note'}>{groupNote}</p>
            </FixedSpaceColumn>
          )}
        </FixedSpaceColumn>
      </FixedSpaceColumn>
    </FormModal>
  )
})
