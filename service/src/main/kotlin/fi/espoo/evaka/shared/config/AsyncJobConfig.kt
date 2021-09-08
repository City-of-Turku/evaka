// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.shared.config

import fi.espoo.evaka.EvakaEnv
import fi.espoo.evaka.shared.async.AsyncJob
import fi.espoo.evaka.shared.async.AsyncJobRunner
import org.jdbi.v3.core.Jdbi
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.event.EventListener
import java.time.Duration

@Configuration
class AsyncJobConfig {
    @Bean
    fun asyncJobRunner(jdbi: Jdbi, evakaEnv: EvakaEnv): AsyncJobRunner<AsyncJob> =
        AsyncJobRunner(jdbi, disableRunner = evakaEnv.asyncJobRunnerDisabled)

    @Bean
    fun asyncJobRunnerSchedule(asyncJobRunner: AsyncJobRunner<AsyncJob>) = object {
        @EventListener
        fun onApplicationReady(@Suppress("UNUSED_PARAMETER") event: ApplicationReadyEvent) {
            asyncJobRunner.schedulePeriodicRun(Duration.ofMinutes(1))
        }
    }
}
