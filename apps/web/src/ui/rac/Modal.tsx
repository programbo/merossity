import {
  Dialog,
  Modal as RACModal,
  ModalOverlay,
  type ModalOverlayProps,
  composeRenderProps,
} from 'react-aria-components'
import { cls } from '../cls'

export function Modal(props: ModalOverlayProps & { children: React.ReactNode }) {
  return (
    <ModalOverlay
      {...props}
      className={composeRenderProps(props.className, (className) =>
        cls(
          'fixed inset-0 z-[60] bg-black/55 backdrop-blur-lg',
          'data-[entering]:animate-overlay-in data-[exiting]:animate-overlay-out',
          className,
        ),
      )}
    >
      <div className="flex h-full items-center justify-center p-4">
        <RACModal
          className={cls(
            'max-h-[min(78vh,740px)] w-[min(860px,96vw)] overflow-hidden rounded-[var(--radius-xl)] border border-white/15 bg-[rgba(10,14,22,0.84)] shadow-[0_50px_120px_rgba(0,0,0,0.65)]',
            'data-[entering]:animate-modal-in data-[exiting]:animate-modal-out',
          )}
        >
          <Dialog className="outline-none">{props.children}</Dialog>
        </RACModal>
      </div>
    </ModalOverlay>
  )
}
