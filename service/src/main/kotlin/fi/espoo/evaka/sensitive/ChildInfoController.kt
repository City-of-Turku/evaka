// SPDX-FileCopyrightText: 2017-2024 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.sensitive

import fi.espoo.evaka.Audit
import fi.espoo.evaka.AuditId
import fi.espoo.evaka.shared.ChildId
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.EvakaClock
import fi.espoo.evaka.shared.domain.NotFound
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController

@RestController
class ChildInfoController(private val ac: AccessControl) {

    @GetMapping("/employee-mobile/children/{childId}/basic-info")
    fun getBasicInfo(
        db: Database,
        user: AuthenticatedUser.MobileDevice,
        clock: EvakaClock,
        @PathVariable childId: ChildId,
    ): ChildBasicInformation {
        return db.connect { dbc ->
                dbc.read {
                    ac.requirePermissionFor(it, user, clock, Action.Child.READ_BASIC_INFO, childId)

                    it.getChildBasicInfo(clock, childId) ?: throw NotFound("Child not found")
                }
            }
            .also { Audit.ChildBasicInfoRead.log(targetId = AuditId(childId)) }
    }

    @GetMapping("/employee-mobile/children/{childId}/sensitive-info")
    fun getSensitiveInfo(
        db: Database,
        user: AuthenticatedUser.MobileDevice,
        clock: EvakaClock,
        @PathVariable childId: ChildId,
    ): ChildSensitiveInformation {
        return db.connect { dbc ->
                dbc.read {
                    ac.requirePermissionFor(
                        it,
                        user,
                        clock,
                        Action.Child.READ_SENSITIVE_INFO,
                        childId,
                    )

                    it.getChildSensitiveInfo(childId) ?: throw NotFound("Child not found")
                }
            }
            .also { Audit.ChildSensitiveInfoRead.log(targetId = AuditId(childId)) }
    }
}
