// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.daycare.controllers

import fi.espoo.evaka.daycare.ClubTerm
import fi.espoo.evaka.daycare.PreschoolTerm
import fi.espoo.evaka.daycare.getClubTerms
import fi.espoo.evaka.daycare.getPreschoolTerms
import fi.espoo.evaka.shared.db.Database
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class TermsController {

    @GetMapping("/public/club-terms")
    fun getClubTerms(db: Database): List<ClubTerm> {
        return db.connect { dbc -> dbc.read { it.getClubTerms() } }
    }

    @GetMapping("/public/preschool-terms")
    fun getPreschoolTerms(db: Database): List<PreschoolTerm> {
        return db.connect { dbc -> dbc.read { it.getPreschoolTerms() } }
    }
}
