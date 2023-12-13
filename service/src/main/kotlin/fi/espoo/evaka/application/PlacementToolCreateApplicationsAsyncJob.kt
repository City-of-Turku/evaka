package fi.espoo.evaka.application

import fi.espoo.evaka.shared.async.AsyncJob
import fi.espoo.evaka.shared.async.AsyncJobRunner
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.EvakaClock
import org.springframework.stereotype.Component

@Component
class PlacementToolCreateApplicationsAsyncJob(
    private val placementToolService: PlacementToolService,
    asyncJobRunner: AsyncJobRunner<AsyncJob>
) {
    init {
        asyncJobRunner.registerHandler(::doCreatePlacementToolApplications)
    }

    private fun doCreatePlacementToolApplications(
        db: Database.Connection,
        clock: EvakaClock,
        msg: AsyncJob.PlacementTool
    ) {
        placementToolService.createApplication(db, msg.user, clock, msg.data, msg.defaultServiceNeedOption, msg.nextPreschoolTerm)
    }
}
