// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.varda

import fi.espoo.evaka.shared.db.Database
import mu.KotlinLogging
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

private val logger = KotlinLogging.logger {}

@RestController
@RequestMapping("/varda-dev")
class VardaDevController(
    private val vardaUpdateService: VardaUpdateService,
    private val vardaUpdateServiceV2: VardaUpdateServiceV2,
) {
    @DeleteMapping("/child/{vardaChildId}")
    fun deleteChild(
        db: Database.Connection,
        @PathVariable vardaChildId: Long
    ): ResponseEntity<Unit> {
        if (listOf("dev", "test", "staging").contains(System.getenv("VOLTTI_ENV"))) {
            vardaUpdateService.deleteFeeDataByChild(vardaChildId, db)
            vardaUpdateService.deletePlacementsByChild(vardaChildId, db)
            vardaUpdateService.deleteDecisionsByChild(vardaChildId, db)
            vardaUpdateService.deleteChild(vardaChildId, db)
            return ResponseEntity.ok().build()
        }
        return ResponseEntity.notFound().build()
    }

    @PostMapping("/run-update-all")
    fun runFullVardaUpdate(
        db: Database.Connection
    ): ResponseEntity<Unit> {
        vardaUpdateServiceV2.scheduleVardaUpdate(db, runNow = true)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/reset-children")
    fun resetChildren(
        db: Database.Connection
    ) {
        vardaUpdateServiceV2.resetChildren(db)
    }
}
