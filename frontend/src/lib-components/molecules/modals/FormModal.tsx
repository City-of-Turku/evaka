// SPDX-FileCopyrightText: 2017-2020 City of Espoo
//
// SPDX-License-Identifier: LGPL-2.1-or-later

import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import styled from 'styled-components'
import Button from '../../atoms/buttons/Button'
import AsyncButton from '../../atoms/buttons/AsyncButton'
import Title from '../../atoms/Title'
import { P } from '../../typography'
import { defaultMargins, Gap } from '../../white-space'
import { modalZIndex } from '../../layout/z-helpers'
import { tabletMin } from 'lib-components/breakpoints'
import ModalBackground from './ModalBackground'

export const DimmedModal = styled.div``

interface zIndexProps {
  zIndex?: number
}

export const BackgroundOverlay = styled.div<zIndexProps>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: ${(p) => (p.zIndex ? p.zIndex - 2 : modalZIndex - 2)};
`

interface ModalContainerProps {
  mobileFullScreen?: boolean
}

export const ModalContainer = styled.div<ModalContainerProps>`
  max-width: 500px;
  background: white;
  overflow-x: visible;
  box-shadow: 0 15px 75px 0 rgba(0, 0, 0, 0.5);
  border-radius: 2px;
  padding-left: ${defaultMargins.XXL};
  padding-right: ${defaultMargins.XXL};
  margin-left: ${defaultMargins.xxs};
  margin-right: ${defaultMargins.xxs};
  overflow-y: auto;

  @media (max-width: ${tabletMin}) {
    padding-left: ${defaultMargins.XL};
    padding-right: ${defaultMargins.XL};
    margin-left: ${defaultMargins.s};
    margin-right: ${defaultMargins.s};
  }

  ${(p) =>
    p.mobileFullScreen
      ? `
    @media (max-width: ${tabletMin}) {
      margin-left: 0;
      margin-right: 0;
      max-width: 100%;
      max-height: 100%;
      width: 100%;
      height: 100%;
    }
  `
      : ''}
`

export const ModalWrapper = styled.div<zIndexProps>`
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  position: fixed;
  z-index: ${(p) => (p.zIndex ? p.zIndex : modalZIndex)};
  bottom: 0;
  left: 0;
  right: 0;
  top: 0;
`

export type IconColour = 'blue' | 'orange' | 'green' | 'red'

interface ModalIconProps {
  colour: IconColour
}

export const ModalIcon = styled.div<ModalIconProps>`
  background: ${({ theme: { colors }, ...props }) => {
    switch (props.colour) {
      case 'blue':
        return colors.main.medium
      case 'orange':
        return colors.accents.orange
      case 'green':
        return colors.accents.green
      case 'red':
        return colors.accents.red
      default:
        return colors.main.medium
    }
  }};
  font-size: 36px;
  border-radius: 50%;
  line-height: 60px;
  height: 60px;
  width: 60px;
  text-align: center;
  color: #fff;
  margin: auto;
`

export const ModalButtons = styled.div<{ $singleButton?: boolean }>`
  display: flex;
  flex-direction: row;
  justify-content: center;
  margin-top: ${defaultMargins.XXL};
  margin-bottom: ${defaultMargins.X3L};
  justify-content: ${(p) => (p.$singleButton ? `center` : `space-between`)};

  @media (max-width: ${tabletMin}) {
    margin-bottom: ${defaultMargins.L};
  }
`

export const ModalTitle = styled.div`
  margin-bottom: ${defaultMargins.XXL};
  margin-top: ${defaultMargins.XXL};
`

type CommonProps = {
  title?: string
  text?: string
  resolve: {
    action: () => void
    label: string
    disabled?: boolean
  }
  reject?: {
    action: () => void
    label: string
  }
  className?: string
  icon?: IconProp
  'data-qa'?: string
  children?: React.ReactNode
  iconColour?: IconColour
  mobileFullScreen?: boolean
}

function ModalBase({
  'data-qa': dataQa,
  title,
  text,
  className,
  icon,
  mobileFullScreen,
  children,
  iconColour = 'blue',
  resolve
}: CommonProps) {
  return (
    <ModalBackground>
      <ModalWrapper className={className} data-qa={dataQa}>
        <ModalContainer
          mobileFullScreen={mobileFullScreen}
          data-qa="form-modal"
        >
          {title && title.length > 0 ? (
            <ModalTitle>
              {icon && (
                <>
                  <ModalIcon colour={iconColour}>
                    <FontAwesomeIcon icon={icon} />
                  </ModalIcon>
                  <Gap size={'m'} />
                </>
              )}
              {title && (
                <Title size={1} data-qa="title" centered>
                  {title}
                </Title>
              )}
              {text && (
                <P data-qa="text" centered>
                  {text}
                </P>
              )}
            </ModalTitle>
          ) : (
            <Gap size={'L'} />
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!resolve.disabled) resolve.action()
            }}
          >
            {children}
          </form>
        </ModalContainer>
      </ModalWrapper>
    </ModalBackground>
  )
}

export default React.memo(function FormModal({
  children,
  reject,
  resolve,
  ...props
}: CommonProps) {
  return (
    <ModalBase {...props} resolve={resolve}>
      {children}
      <ModalButtons $singleButton={!reject}>
        {reject && (
          <>
            <Button
              onClick={reject.action}
              data-qa="modal-cancelBtn"
              text={reject.label}
            />
            <Gap horizontal size={'xs'} />
          </>
        )}
        <Button
          primary
          data-qa="modal-okBtn"
          onClick={resolve.action}
          disabled={resolve.disabled}
          text={resolve.label}
        />
      </ModalButtons>
    </ModalBase>
  )
})

type AsyncModalProps = CommonProps & {
  resolve: {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    action: () => Promise<any>
    label: string
    disabled?: boolean
    onSuccess: () => void
  }
  reject: {
    action: () => void
    label: string
  }
}

export const AsyncFormModal = React.memo(function AsyncFormModal({
  children,
  resolve,
  reject,
  ...props
}: AsyncModalProps) {
  return (
    <ModalBase {...props} resolve={resolve}>
      {children}
      <ModalButtons $singleButton={!reject}>
        {reject && (
          <>
            <Button
              onClick={reject.action}
              data-qa="modal-cancelBtn"
              text={reject.label}
            />
            <Gap horizontal size={'xs'} />
          </>
        )}
        <AsyncButton
          primary
          text={resolve.label}
          disabled={resolve.disabled}
          onClick={resolve.action}
          onSuccess={resolve.onSuccess}
          data-qa="modal-okBtn"
        />
      </ModalButtons>
    </ModalBase>
  )
})
