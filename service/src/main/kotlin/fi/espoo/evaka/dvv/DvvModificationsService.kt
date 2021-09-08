// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

package fi.espoo.evaka.dvv

import fi.espoo.evaka.identity.ExternalIdentifier
import fi.espoo.evaka.pis.addSSNToPerson
import fi.espoo.evaka.pis.getParentships
import fi.espoo.evaka.pis.getPartnersForPerson
import fi.espoo.evaka.pis.getPersonBySSN
import fi.espoo.evaka.pis.service.FridgeFamilyService
import fi.espoo.evaka.pis.service.PersonService
import fi.espoo.evaka.pis.updateParentshipDuration
import fi.espoo.evaka.pis.updatePartnershipDuration
import fi.espoo.evaka.pis.updatePersonFromVtj
import fi.espoo.evaka.shared.async.AsyncJob
import fi.espoo.evaka.shared.async.AsyncJobRunner
import fi.espoo.evaka.shared.auth.AuthenticatedUser
import fi.espoo.evaka.shared.db.Database
import fi.espoo.evaka.shared.domain.DateRange
import mu.KotlinLogging
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.util.UUID

private val logger = KotlinLogging.logger {}

@Service
class DvvModificationsService(
    private val dvvModificationsServiceClient: DvvModificationsServiceClient,
    private val personService: PersonService,
    private val fridgeFamilyService: FridgeFamilyService,
    private val asyncJobRunner: AsyncJobRunner<AsyncJob>
) {

    fun updatePersonsFromDvv(db: Database, ssns: List<String>): Int {
        return db.transaction { getDvvModifications(it, ssns) }.let { modificationsForPersons ->
            val ssnsToUpdateFromVtj: MutableSet<String> = emptySet<String>().toMutableSet()

            modificationsForPersons.map { personModifications ->
                personModifications.tietoryhmat.map { infoGroup ->
                    try {
                        when (infoGroup) {
                            is DeathDvvInfoGroup -> handleDeath(db, personModifications.henkilotunnus, infoGroup)
                            is RestrictedInfoDvvInfoGroup -> handleRestrictedInfo(
                                db,
                                personModifications.henkilotunnus,
                                infoGroup
                            )
                            is SsnDvvInfoGroup -> handleSsnDvvInfoGroup(
                                db,
                                personModifications.henkilotunnus,
                                infoGroup
                            )
                            is AddressDvvInfoGroup -> handleAddressDvvInfoGroup(
                                db,
                                personModifications.henkilotunnus,
                                infoGroup
                            )
                            is ResidenceCodeDvvInfoGroup -> handleResidenceCodeDvvInfoGroup(
                                db,
                                personModifications.henkilotunnus,
                                infoGroup
                            )
                            is CustodianLimitedDvvInfoGroup -> ssnsToUpdateFromVtj.add(personModifications.henkilotunnus)
                            is CaretakerLimitedDvvInfoGroup -> {
                                if (infoGroup.huoltaja.henkilotunnus != null)
                                    ssnsToUpdateFromVtj.add(infoGroup.huoltaja.henkilotunnus)
                                else
                                    logger.info("Dvv modification ignored for caretaker: ssn is null")
                            }
                            is PersonNameDvvInfoGroup -> ssnsToUpdateFromVtj.add(personModifications.henkilotunnus)
                            is PersonNameChangeDvvInfoGroup -> ssnsToUpdateFromVtj.add(personModifications.henkilotunnus)
                            is HomeMunicipalityDvvInfoGroup -> handleHomeMunicipalityChangeDvvInfoGroup()
                            else -> logger.info("Unsupported DVV modification: ${infoGroup.tietoryhma} (all modification in this group: ${personModifications.tietoryhmat.map { it.tietoryhma }.joinToString(", ")})")
                        }
                    } catch (e: Throwable) {
                        logger.error(e) {
                            "Could not process dvv modification for ${
                            personModifications.henkilotunnus.substring(
                                0,
                                6
                            )
                            }: ${e.message}"
                        }
                    }
                }
            }

            logger.info("Dvv modifications: updating ${ssnsToUpdateFromVtj.size} persons from VTJ")

            ssnsToUpdateFromVtj.forEach { ssn ->
                db.transaction { tx ->
                    personService.getOrCreatePerson(tx, AuthenticatedUser.SystemInternalUser, ExternalIdentifier.SSN.getInstance(ssn))
                }?.let {
                    logger.info("Refreshing all VTJ information for person ${it.id}")
                    fridgeFamilyService.doVTJRefresh(db, AsyncJob.VTJRefresh(it.id, AuthenticatedUser.SystemInternalUser.id))
                }
            }

            modificationsForPersons.size
        }
    }

    private fun handleDeath(db: Database, ssn: String, deathDvvInfoGroup: DeathDvvInfoGroup) {
        if (deathDvvInfoGroup.kuollut != true || deathDvvInfoGroup.kuolinpv == null) return

        db.transaction { tx ->
            tx.getPersonBySSN(ssn)?.let { person ->
                val dateOfDeath = deathDvvInfoGroup.kuolinpv.asLocalDate()
                logger.info("Dvv modification for ${person.id}: marking dead since $dateOfDeath")
                tx.updatePersonFromVtj(person.copy(dateOfDeath = dateOfDeath))

                endFamilyRelations(tx, person.id, dateOfDeath)
                asyncJobRunner.plan(tx, listOf(AsyncJob.GenerateFinanceDecisions.forAdult(person.id, DateRange(dateOfDeath, null))))
                asyncJobRunner.plan(tx, listOf(AsyncJob.GenerateFinanceDecisions.forChild(person.id, DateRange(dateOfDeath, null))))
            }
        }
    }

    private fun endFamilyRelations(tx: Database.Transaction, personId: UUID, dateOfDeath: LocalDate) {
        tx
            .getPartnersForPerson(personId, includeConflicts = true, period = DateRange(dateOfDeath, dateOfDeath))
            .forEach { tx.updatePartnershipDuration(it.partnershipId, it.startDate, dateOfDeath) }

        tx
            .getParentships(
                headOfChildId = personId,
                childId = null,
                includeConflicts = true,
                period = DateRange(dateOfDeath, dateOfDeath)
            )
            .forEach { tx.updateParentshipDuration(it.id, it.startDate, dateOfDeath) }

        tx
            .getParentships(
                headOfChildId = null,
                childId = personId,
                includeConflicts = true,
                period = DateRange(dateOfDeath, dateOfDeath)
            )
            .forEach { tx.updateParentshipDuration(it.id, it.startDate, dateOfDeath) }
    }

    private fun handleRestrictedInfo(
        db: Database,
        ssn: String,
        restrictedInfoDvvInfoGroup: RestrictedInfoDvvInfoGroup
    ) = db.transaction { tx ->
        tx.getPersonBySSN(ssn)?.let {
            logger.info("Dvv modification for ${it.id}: restricted ${restrictedInfoDvvInfoGroup.turvakieltoAktiivinen}")
            tx.updatePersonFromVtj(
                it.copy(
                    restrictedDetailsEnabled = restrictedInfoDvvInfoGroup.turvakieltoAktiivinen,
                    restrictedDetailsEndDate = restrictedInfoDvvInfoGroup.turvaLoppuPv?.asLocalDate(),
                    streetAddress = if (restrictedInfoDvvInfoGroup.turvakieltoAktiivinen) "" else it.streetAddress,
                    postalCode = if (restrictedInfoDvvInfoGroup.turvakieltoAktiivinen) "" else it.postalCode,
                    postOffice = if (restrictedInfoDvvInfoGroup.turvakieltoAktiivinen) "" else it.postOffice
                )
            )
        }
    }

    private fun handleSsnDvvInfoGroup(db: Database, ssn: String, ssnDvvInfoGroup: SsnDvvInfoGroup) =
        db.transaction { tx ->
            tx.getPersonBySSN(ssn)?.let {
                logger.info("Dvv modification for ${it.id}: ssn change")
                tx.addSSNToPerson(it.id, ssnDvvInfoGroup.aktiivinenHenkilotunnus)
            }
        }

    // We get records LISATTY + MUUTETTU if address has changed (LISATTY is the new address),
    // TURVAKIELTO=false and MUUTETTU if restrictions are lifted (MUUTETTU is the "new" address)
    private fun handleAddressDvvInfoGroup(db: Database, ssn: String, addressDvvInfoGroup: AddressDvvInfoGroup) =
        db.transaction { tx ->
            tx.getPersonBySSN(ssn)?.let {
                if (addressDvvInfoGroup.muutosattribuutti.equals("LISATTY") || (
                    addressDvvInfoGroup.muutosattribuutti.equals("MUUTETTU") && it.streetAddress.isNullOrEmpty()
                    )
                ) {
                    logger.info("Dvv modification for ${it.id}: address change, type: ${addressDvvInfoGroup.muutosattribuutti}")
                    tx.updatePersonFromVtj(
                        it.copy(
                            streetAddress = addressDvvInfoGroup.katuosoite(),
                            postalCode = addressDvvInfoGroup.postinumero ?: "",
                            postOffice = addressDvvInfoGroup.postitoimipaikka?.fi ?: ""
                        )
                    )
                }
            }
        }

    private fun handleResidenceCodeDvvInfoGroup(
        db: Database,
        ssn: String,
        residenceCodeDvvInfoGroup: ResidenceCodeDvvInfoGroup
    ) = db.transaction { tx ->
        if (residenceCodeDvvInfoGroup.muutosattribuutti.equals("LISATTY")) {
            tx.getPersonBySSN(ssn)?.let {
                logger.info("Dvv modification for ${it.id}: residence code change")
                tx.updatePersonFromVtj(
                    it.copy(
                        residenceCode = residenceCodeDvvInfoGroup.asuinpaikantunnus
                    )
                )
            }
        }
    }

    // KOTIKUNTA is received as part of the other address change info groups, the actual address change
    // is done in those
    private fun handleHomeMunicipalityChangeDvvInfoGroup() {
        logger.debug("DVV change KOTIKUNTA received")
    }

    fun getDvvModifications(tx: Database.Transaction, ssns: List<String>): List<DvvModification> {
        val token = tx.getNextDvvModificationToken()
        return getAllPagesOfDvvModifications(tx, ssns, token, emptyList())
    }

    fun getAllPagesOfDvvModifications(
        tx: Database.Transaction,
        ssns: List<String>,
        token: String,
        alreadyFoundDvvModifications: List<DvvModification>
    ): List<DvvModification> {
        logger.debug("Fetching dvv modifications with $token, found modifications so far: ${alreadyFoundDvvModifications.size}")
        return dvvModificationsServiceClient.getModifications(token, ssns).let { dvvModificationsResponse ->
            val combinedModifications = alreadyFoundDvvModifications + dvvModificationsResponse.muutokset
            if (dvvModificationsResponse.ajanTasalla) {
                if (dvvModificationsResponse.viimeisinKirjausavain != token)
                    tx.storeDvvModificationToken(
                        token,
                        dvvModificationsResponse.viimeisinKirjausavain,
                        ssns.size,
                        dvvModificationsResponse.muutokset.size
                    )
                combinedModifications
            } else {
                getAllPagesOfDvvModifications(
                    tx,
                    ssns,
                    dvvModificationsResponse.viimeisinKirjausavain,
                    combinedModifications
                )
            }
        }
    }
}
