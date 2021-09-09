// SPDX-FileCopyrightText: 2017-2021 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.serviceneed

import fi.espoo.evaka.Audit
import fi.espoo.evaka.placement.PlacementType
import fi.espoo.evaka.shared.PlacementId
import fi.espoo.evaka.shared.ServiceNeedId
import fi.espoo.evaka.shared.ServiceNeedOptionId
import fi.espoo.evaka.shared.async.AsyncJobRunner
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.FiniteDateRange
import fi.espoo.evaka.shared.domain.HelsinkiDateTime
import fi.espoo.evaka.shared.security.AccessControl
import fi.espoo.evaka.shared.security.Action
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

@RestController
class ServiceNeedController(
    private val accessControl: AccessControl,
    private val asyncJobRunner: AsyncJobRunner
) {

    data class ServiceNeedCreateRequest(
        val placementId: PlacementId,
        val startDate: LocalDate,
        val endDate: LocalDate,
        val optionId: ServiceNeedOptionId,
        val shiftCare: Boolean
    )

    @PostMapping("/service-needs")
    fun postServiceNeed(
        db: Database.Connection,
        user: AuthenticatedUser,
        @RequestBody body: ServiceNeedCreateRequest
    ): ResponseEntity<Unit> {
        Audit.PlacementServiceNeedCreate.log(targetId = body.placementId)
        accessControl.requirePermissionFor(user, Action.Placement.CREATE_SERVICE_NEED, body.placementId)

        db.transaction { tx ->
            createServiceNeed(
                tx = tx,
                user = user,
                placementId = body.placementId,
                startDate = body.startDate,
                endDate = body.endDate,
                optionId = body.optionId,
                shiftCare = body.shiftCare,
                confirmedAt = HelsinkiDateTime.now()
            )
                .let { id -> tx.getServiceNeedChildRange(id) }
                .let { notifyServiceNeedUpdated(tx, asyncJobRunner, it) }
        }
        asyncJobRunner.scheduleImmediateRun()

        return ResponseEntity.noContent().build()
    }

    data class ServiceNeedUpdateRequest(
        val startDate: LocalDate,
        val endDate: LocalDate,
        val optionId: ServiceNeedOptionId,
        val shiftCare: Boolean
    )

    @PutMapping("/service-needs/{id}")
    fun putServiceNeed(
        db: Database.Connection,
        user: AuthenticatedUser,
        @PathVariable id: ServiceNeedId,
        @RequestBody body: ServiceNeedUpdateRequest
    ): ResponseEntity<Unit> {
        Audit.PlacementServiceNeedUpdate.log(targetId = id)
        accessControl.requirePermissionFor(user, Action.ServiceNeed.UPDATE, id)

        db.transaction { tx ->
            val oldRange = tx.getServiceNeedChildRange(id)
            updateServiceNeed(
                tx = tx,
                user = user,
                id = id,
                startDate = body.startDate,
                endDate = body.endDate,
                optionId = body.optionId,
                shiftCare = body.shiftCare,
                confirmedAt = HelsinkiDateTime.now()
            )
            notifyServiceNeedUpdated(
                tx,
                asyncJobRunner,
                ServiceNeedChildRange(
                    childId = oldRange.childId,
                    dateRange = FiniteDateRange(
                        minOf(oldRange.dateRange.start, body.startDate),
                        maxOf(oldRange.dateRange.end, body.endDate)
                    )
                )
            )
        }
        asyncJobRunner.scheduleImmediateRun()

        return ResponseEntity.noContent().build()
    }

    @DeleteMapping("/service-needs/{id}")
    fun deleteServiceNeed(
        db: Database.Connection,
        user: AuthenticatedUser,
        @PathVariable id: ServiceNeedId
    ): ResponseEntity<Unit> {
        Audit.PlacementServiceNeedDelete.log(targetId = id)
        accessControl.requirePermissionFor(user, Action.ServiceNeed.DELETE, id)

        db.transaction { tx ->
            val childRange = tx.getServiceNeedChildRange(id)
            tx.deleteServiceNeed(id)
            notifyServiceNeedUpdated(tx, asyncJobRunner, childRange)
        }
        asyncJobRunner.scheduleImmediateRun()

        return ResponseEntity.noContent().build()
    }

    @GetMapping("/service-needs/options")
    fun getServiceNeedOptions(
        db: Database.Connection,
        user: AuthenticatedUser
    ): List<ServiceNeedOption> {
        Audit.ServiceNeedOptionsRead.log()
        user.requireAnyEmployee()

        return db.read { it.getServiceNeedOptions() }
    }

    @GetMapping("/public/service-needs/options")
    fun getServiceNeedOptionPublicInfos(
        db: Database.Connection,
        @RequestParam(required = true) placementTypes: List<PlacementType>
    ): List<ServiceNeedOptionPublicInfo> {
        return db.read { it.getServiceNeedOptionPublicInfos(placementTypes) }
    }
}
