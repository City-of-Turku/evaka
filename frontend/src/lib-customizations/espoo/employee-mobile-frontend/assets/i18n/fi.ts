// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

export const fi = {
  common: {
    loadingFailed: 'Tietojen haku epäonnistui',
    cancel: 'Peruuta',
    confirm: 'Vahvista',
    all: 'Kaikki',
    statuses: {
      active: 'Aktiivinen',
      coming: 'Tulossa',
      completed: 'Päättynyt',
      conflict: 'Konflikti'
    },
    types: {
      CLUB: 'Kerho',
      FAMILY: 'Perhepäivähoito',
      GROUP_FAMILY: 'Ryhmäperhepäivähoito',
      CENTRE: 'Päiväkoti',
      PRESCHOOL: 'Esiopetus',
      DAYCARE: 'Varhaiskasvatus',
      PRESCHOOL_DAYCARE: 'Liittyvä varhaiskasvatus',
      PREPARATORY_EDUCATION: 'Valmistava esiopetus',
      PREPARATORY_DAYCARE: 'Liittyvä varhaiskasvatus',
      DAYCARE_5YO_FREE: '5v maksuton varhaiskasvatus',
      DAYCARE_5YO_PAID: 'Varhaiskasvatus (maksullinen)'
    },
    placement: {
      CLUB: 'Kerho',
      DAYCARE: 'Varhaiskasvatus',
      DAYCARE_PART_TIME: 'Osapäiväinen varhaiskasvatus',
      DAYCARE_FIVE_YEAR_OLDS: '5-vuotiaiden varhaiskasvatus',
      DAYCARE_PART_TIME_FIVE_YEAR_OLDS:
        '5-vuotiaiden osapäiväinen varhaiskasvatus',
      PRESCHOOL: 'Esiopetus',
      PRESCHOOL_DAYCARE: 'Liittyvä varhaiskasvatus',
      PREPARATORY: 'Valmistava',
      PREPARATORY_DAYCARE: 'Valmistava',
      TEMPORARY_DAYCARE: 'Väliaikainen',
      TEMPORARY_DAYCARE_PART_DAY: 'Väliaikainen osa-aikainen',
      SCHOOL_SHIFT_CARE: 'Koululaisten vuorohoito'
    },
    code: 'Koodi',
    children: 'Lapset',
    staff: 'Henkilökunta',
    messages: 'Viestit',
    back: 'Takaisin',
    hours: 'Tuntia',
    remove: 'Poista',
    doNotRemove: 'Älä poista',
    clear: 'Tyhjennä',
    save: 'Tallenna',
    doNotSave: 'Älä tallenna',
    starts: 'Alkaa',
    ends: 'Päättyy',
    information: 'Tiedot',
    dailyNotes: 'Muistiinpanot',
    saveBeforeClosing: 'Tallennetaanko ennen sulkemista',
    hourShort: 't',
    minuteShort: 'min',
    errors: {
      minutes: 'Korkeintaan 59 minuuttia'
    },
    child: 'Lapsi',
    group: 'Ryhmä'
  },
  absences: {
    title: 'Poissaolomerkinnät',
    absenceTypes: {
      OTHER_ABSENCE: 'Muu poissaolo',
      SICKLEAVE: 'Sairaus',
      UNKNOWN_ABSENCE: 'Ilmoittamaton poissaolo',
      PLANNED_ABSENCE: 'Suunniteltu poissaolo / vuorohoito',
      TEMPORARY_RELOCATION: 'Lapsi varasijoitettuna muualla',
      TEMPORARY_VISITOR: 'Varalapsi läsnä',
      PARENTLEAVE: 'Isyysvapaa',
      FORCE_MAJEURE: 'Maksuton päivä',
      PRESENCE: 'Ei poissaoloa'
    },
    careTypes: {
      SCHOOL_SHIFT_CARE: 'Koululaisten vuorohoito',
      PRESCHOOL: 'Esiopetus',
      PRESCHOOL_DAYCARE: 'Liittyvä varhaiskasvatus',
      DAYCARE_5YO_FREE: '5-vuotiaiden varhaiskasvatus',
      DAYCARE: 'Varhaiskasvatus',
      CLUB: 'Kerho'
    },
    absence: 'Poissaolo',
    chooseStartDate: 'Valitse tuleva päivä',
    startBeforeEnd: 'Aloitus oltava ennen päättymispäivää.',
    reason: 'Poissaolon syy',
    fullDayHint: 'Poissaolomerkintä tehdään koko päivälle',
    confirmDelete: 'Haluatko poistaa tämän poissaolon?',
    futureAbsence: 'Tulevat poissaolot'
  },
  attendances: {
    types: {
      COMING: 'Tulossa',
      PRESENT: 'Läsnä',
      DEPARTED: 'Lähtenyt',
      ABSENT: 'Poissa'
    },
    status: {
      COMING: 'Tulossa',
      PRESENT: 'Saapunut',
      DEPARTED: 'Lähtenyt',
      ABSENT: 'Poissa'
    },
    groupSelectError: 'Valitun ryhmän nimeä ei löytynyt',
    actions: {
      markAbsent: 'Merkitse poissaolevaksi',
      markPresent: 'Merkitse saapuneeksi',
      markDeparted: 'Merkitse lähteneeksi',
      returnToComing: 'Palauta tulossa oleviin',
      returnToPresent: 'Palauta läsnäoleviin',
      markAbsentBeforehand: 'Tulevat poissaolot'
    },
    timeLabel: 'Merkintä',
    departureTime: 'Lähtöaika',
    arrivalTime: 'Saapumisaika',
    chooseGroup: 'Valitse ryhmä',
    chooseGroupInfo: 'Lapsia: Läsnä nyt/Ryhmässä yhteensä',
    searchPlaceholder: 'Etsi lapsen nimellä',
    noAbsences: 'Ei poissaoloja',
    missingFrom: 'Poissa seuraavasta toimintamuodosta',
    missingFromPlural: 'Poissa seuraavista toimintamuodoista',
    timeError: 'Virheellinen aika',
    listChildReservation: (start: string, end: string) =>
      `Varaus ${start}-${end}`,
    arrived: 'Saapui',
    departed: 'Lähti',
    serviceTime: {
      reservation: (start: string, end: string) =>
        `Varaus tänään ${start}-${end}`,
      serviceToday: (start: string, end: string) =>
        `Varhaiskasvatusaika tänään ${start}-${end}`,
      noServiceToday: 'Ei varattua varhaiskasvatusaikaa tänään',
      notSet: 'Varhaiskasvatusaikaa ei asetettuna',
      variableTimes: 'Vaihteleva varhaiskasvatusaika'
    },
    notes: {
      dailyNotes: 'Muistiinpanot',
      labels: {
        note: 'Päivän tapahtumia (ei terveystietoja)',
        feedingNote: 'Lapsi söi tänään',
        sleepingNote: 'Lapsi nukkui tänään',
        reminderNote: 'Muistettavia asioita',
        groupNotesHeader: 'Muistiinpano koko ryhmälle'
      },
      sleepingValues: {
        GOOD: 'Hyvin',
        MEDIUM: 'Vähän',
        NONE: 'Ei ollenkaan'
      },
      feedingValues: {
        GOOD: 'Hyvin',
        MEDIUM: 'Vähän',
        NONE: 'Ei ollenkaan/maistoi'
      },
      reminders: {
        DIAPERS: 'Lisää vaippoja',
        CLOTHES: 'Lisää varavaatteita',
        LAUNDRY: 'Repussa pyykkiä'
      },
      placeholders: {
        note: 'Mitä tänään opin, leikin, oivalsin.',
        groupNote: 'Kirjoita muistiinpano ja ajankohta',
        reminderNote: 'Muuta muistutettavaa esim. Aurinkovoide.',
        hours: 'tunnit',
        minutes: 'minuutit'
      },
      noNotes: 'Ei merkintöjä tälle päivälle',
      clearTitle: 'Haluatko tyhjentää merkinnät tältä päivältä?',
      confirmTitle: 'Tallennetaanko tehdyt merkinnät ennen sulkemista?',
      closeWithoutSaving: 'Sulje tallentamatta',
      groupNote: 'Ryhmän muistiinpano',
      note: 'Lapsen päivän muistiinpanot'
    },
    absenceTitle: 'Poissaolomerkintä',
    pin: {
      header: 'Lukituksen avaaminen',
      info: 'Anna PIN-koodi avataksesi lapsen tiedot',
      selectStaff: 'Valitse käyttäjä',
      staff: 'Käyttäjä',
      noOptions: 'Ei vaihtoehtoja',
      pinCode: 'PIN-koodi',
      status: {
        SUCCESS: 'Oikea PIN-koodi',
        WRONG_PIN: 'Väärä PIN-koodi',
        PIN_LOCKED: 'PIN-koodi on lukittu',
        NOT_FOUND: 'Tuntematon käyttäjä'
      },
      logOut: 'Kirjaudu ulos'
    },
    childInfo: {
      header: 'Lapsen tiedot',
      personalInfoHeader: 'Lapsen henkilötiedot',
      childName: 'Lapsen nimi',
      preferredName: 'Kutsumanimi',
      ssn: 'Hetu',
      address: 'Lapsen kotiosoite',
      type: 'Sijoitusmuoto',
      allergiesHeader: 'Allergiat, ruokavalio, lääkitys',
      allergies: 'Allergiat',
      diet: 'Ruokavalio',
      medication: 'Lääkitys',
      contactInfoHeader: 'Yhteystiedot',
      contact: 'Yhteyshenkilö',
      name: 'Nimi',
      phone: 'Puhelinnumero',
      backupPhone: 'Varapuhelinnumero',
      email: 'Sähköpostiosoite',
      backupPickup: 'Varahakija',
      backupPickupName: 'Varahakijan nimi',
      image: {
        modalMenu: {
          title: 'Lapsen profiilikuva',
          takeImageButton: 'Valitse kuva',
          deleteImageButton: 'Poista kuva',
          deleteConfirm: {
            title: 'Haluatko varmasti poistaa lapsen kuvan?',
            resolve: 'Poista kuva',
            reject: 'Älä poista'
          }
        }
      }
    }
  },
  staff: {
    title: 'Henkilökunnan määrä tänään',
    daycareResponsible: 'Kasvatusvastuullisia',
    other: 'Muita (esim. avustajat, opiskelijat, veot)',
    cancel: 'Peru muokkaus',
    realizedGroupOccupancy: 'Ryhmän käyttöaste tänään',
    realizedUnitOccupancy: 'Yksikön käyttöaste tänään',
    notUpdated: 'Tietoja ei ole päivitetty',
    updatedToday: 'Tiedot päivitetty tänään',
    updated: 'Tiedot päivitetty'
  },
  mobile: {
    landerText1:
      'Tervetuloa käyttämään Espoon varhaiskasvatuksen mobiilisovellusta!',
    landerText2:
      'Ottaaksesi sovelluksen käyttöön valitse alta ‘Lisää laite’ ja rekisteröi mobiililaite eVakassa oman yksikkösi sivulla.',
    actions: {
      ADD_DEVICE: 'Lisää laite',
      START: 'Aloitetaan'
    },
    wizard: {
      text1:
        'Mene eVakassa yksikkösi sivulle ja syötä sieltä saatava 10-merkkinen koodi kenttään alla.',
      text2: 'Syötä alla oleva vahvistuskoodi yksikkösi sivulle eVakaan.',
      title1: 'eVaka-mobiilin käyttöönotto, vaihe 1/3',
      title2: 'eVaka-mobiilin käyttöönotto, vaihe 2/3',
      title3: 'Tervetuloa käyttämään eVaka-mobiilia!',
      text3: 'eVaka-mobiili on nyt käytössä tässä laitteessa.',
      text4:
        'Turvataksesi lasten tiedot muistathan asettaa laitteeseen pääsykoodin, jos et ole sitä vielä tehnyt.'
    },
    emptyList: {
      no: 'Ei',
      status: {
        COMING: 'tulossa olevia',
        ABSENT: 'poissaolevia',
        PRESENT: 'läsnäolevia',
        DEPARTED: 'lähteneitä'
      },
      children: 'lapsia'
    }
  }
}
