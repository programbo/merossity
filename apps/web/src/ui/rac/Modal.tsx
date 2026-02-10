'use client'

import { Dialog, Modal as RACModal, ModalOverlay, type ModalOverlayProps, composeRenderProps } from 'react-aria-components'

import { cls } from '../cls'

export function Modal(props: ModalOverlayProps & { children: React.ReactNode }) {
  return (
    <ModalOverlay
      {...props}
      className={composeRenderProps(props.className, (className) => cls('rac-modalOverlay', className))}
    >
      <div className="rac-modalOverlay__center">
        <RACModal className="rac-modal">
          <Dialog className="rac-dialog">{props.children}</Dialog>
        </RACModal>
      </div>
    </ModalOverlay>
  )
}

