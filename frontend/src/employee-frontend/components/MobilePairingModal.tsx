// SPDX-FileCopyrightText: 2017-2022 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React, { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'

import type { Pairing } from 'lib-common/generated/api-types/pairing'
import type {
  DaycareId,
  EmployeeId
} from 'lib-common/generated/api-types/shared'
import { pendingQuery, useMutationResult, useQuery } from 'lib-common/query'
import InputField from 'lib-components/atoms/form/InputField'
import InfoModal from 'lib-components/molecules/modals/InfoModal'
import { Bold, fontWeights, P } from 'lib-components/typography'
import colors from 'lib-customizations/common'
import { faPlus } from 'lib-icons'

import {
  pairingStatusQuery,
  postPairingMutation,
  postPairingResponseMutation,
  putMobileDeviceNameMutation
} from '../queries'
import { useTranslation } from '../state/i18n'

type IdProps = { unitId: DaycareId } | { employeeId: EmployeeId }

type Props = IdProps & { closeModal: () => void }

const Flex = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`

const ResponseKey = styled.div`
  font-family: Montserrat, sans-serif;
  font-style: normal;
  font-weight: ${fontWeights.semibold};
  font-size: 30px;
  line-height: 30px;
  text-align: center;
  letter-spacing: 0.08em;
  color: ${colors.grayscale.g70};
`

export default React.memo(function MobilePairingModal({
  closeModal,
  ...idProps
}: Props) {
  const { i18n } = useTranslation()

  const [phase, setPhase] = useState<1 | 2 | 3>(1)
  const [responseKey, setResponseKey] = useState<string>('')
  const [deviceName, setDeviceName] = useState<string>('')
  const [pairingResponse, setPairingResponse] = useState<Pairing>()

  const { mutateAsync: postPairingResult } = useMutationResult(
    postPairingMutation,
    { onSuccess: (res) => setPairingResponse(res) }
  )
  const { mutateAsync: postPairingResponseResult } = useMutationResult(
    postPairingResponseMutation,
    {
      onSuccess: (res) => {
        setPairingResponse(res)
        if (res.status === 'READY') {
          setPhase(3)
        }
      }
    }
  )
  const { refetch: getPairingStatus } = useQuery(
    pairingResponse !== undefined
      ? pairingStatusQuery({ id: pairingResponse.id })
      : pendingQuery<Pairing>(),
    {
      enabled: false
    }
  )
  const { mutateAsync: putMobileDeviceNameResult } = useMutationResult(
    putMobileDeviceNameMutation,
    {
      onSuccess: closeModal
    }
  )

  useEffect(() => {
    if (phase === 1) {
      void postPairingResult({ body: idProps })
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (responseKey.length === 6) {
      if (pairingResponse !== undefined) {
        void postPairingResponseResult({
          id: pairingResponse.id,
          body: {
            challengeKey: pairingResponse.challengeKey,
            responseKey
          }
        })
      }
    }
  }, [responseKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const polling = setInterval(() => {
      if (pairingResponse !== undefined) {
        if (pairingResponse.status === 'WAITING_CHALLENGE') {
          void getPairingStatus().then((status) => {
            if (status.isSuccess) {
              if (status.data.status === 'WAITING_RESPONSE') {
                clearInterval(polling)
                setPhase(2)
              }
            }
          })
        }
      }
    }, 1000)
    return () => clearInterval(polling)
  }, [getPairingStatus, pairingResponse])

  const actions = useMemo(() => {
    if (phase !== 3) {
      return { resolve: { action: closeModal, label: i18n.common.cancel } }
    }

    const saveDeviceName = () => {
      if (pairingResponse !== undefined && pairingResponse.mobileDeviceId) {
        void putMobileDeviceNameResult({
          id: pairingResponse.mobileDeviceId,
          body: {
            name: deviceName
          }
        })
      }
    }

    return {
      reject: { action: closeModal, label: i18n.common.cancel },
      resolve: { action: saveDeviceName, label: i18n.common.ready }
    }
  }, [
    phase,
    closeModal,
    i18n,
    pairingResponse,
    putMobileDeviceNameResult,
    deviceName
  ])

  return (
    <InfoModal
      title={
        'unitId' in idProps
          ? i18n.mobilePairingModal.sharedDeviceModalTitle
          : i18n.mobilePairingModal.personalDeviceModalTitle
      }
      icon={faPlus}
      data-qa={`mobile-pairing-modal-phase-${phase}`}
      type={phase === 3 ? 'success' : 'info'}
      {...actions}
    >
      {phase === 1 && (
        <>
          <P centered>
            {i18n.mobilePairingModal.modalText1}
            <br />
            <Bold>{`${window.location.hostname}/employee/mobile`}</Bold>
            <br />
            {i18n.mobilePairingModal.modalText2}
          </P>
          {pairingResponse && (
            <ResponseKey data-qa="challenge-key">
              {pairingResponse.challengeKey}
            </ResponseKey>
          )}
        </>
      )}

      {phase === 2 && (
        <>
          <P centered>{i18n.mobilePairingModal.modalText3}</P>
          {pairingResponse && (
            <Flex>
              <InputField
                value={responseKey}
                onChange={(v) => setResponseKey(v.toLowerCase())}
                placeholder={i18n.common.code}
                width="m"
                data-qa="response-key-input"
              />
            </Flex>
          )}
        </>
      )}

      {phase === 3 && (
        <>
          <P centered>{i18n.mobilePairingModal.modalText4}</P>
          {pairingResponse && (
            <Flex>
              {pairingResponse.mobileDeviceId ? (
                <InputField
                  value={deviceName}
                  onChange={setDeviceName}
                  placeholder={i18n.mobilePairingModal.namePlaceholder}
                  width="m"
                  data-qa="mobile-device-name-input"
                  id={pairingResponse.mobileDeviceId}
                />
              ) : (
                <div>{i18n.common.loadingFailed}</div>
              )}
            </Flex>
          )}
        </>
      )}
    </InfoModal>
  )
})
