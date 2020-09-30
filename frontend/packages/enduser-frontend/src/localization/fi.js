// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

/* Finnish locals for flatpickr */
const Flatpickr = Flatpickr || { l10ns: {} }
Flatpickr.l10ns.fi = {}

Flatpickr.l10ns.fi.firstDayOfWeek = 1
Flatpickr.l10ns.fi.weekAbbreviation = 'vko'

Flatpickr.l10ns.fi.weekdays = {
  shorthand: ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'],
  longhand: [
    'Sunnuntai',
    'Maanantai',
    'Tiistai',
    'Keskiviikko',
    'Torstai',
    'Perjantai',
    'Lauantai'
  ]
}

Flatpickr.l10ns.fi.months = {
  shorthand: [
    'Tammi',
    'Helmi',
    'Maalis',
    'Huhti',
    'Touko',
    'Kesä',
    'Heinä',
    'Elo',
    'Syys',
    'Loka',
    'Marras',
    'Joulu'
  ],
  longhand: [
    'Tammikuu',
    'Helmikuu',
    'Maaliskuu',
    'Huhtikuu',
    'Toukokuu',
    'Kesäkuu',
    'Heinäkuu',
    'Elokuu',
    'Syyskuu',
    'Lokakuu',
    'Marraskuu',
    'Joulukuu'
  ]
}

Flatpickr.l10ns.fi.ordinal = function() {
  return '.'
}

if (typeof module !== 'undefined') {
  module.exports = Flatpickr.l10ns
}
