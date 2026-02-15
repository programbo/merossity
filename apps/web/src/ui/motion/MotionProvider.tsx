import type { ReactNode } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react'

export { AnimatePresence, m }

export function MotionProvider(props: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{props.children}</MotionConfig>
    </LazyMotion>
  )
}
