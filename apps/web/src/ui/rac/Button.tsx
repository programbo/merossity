'use client'

import { Button as RACButton, type ButtonProps as RACButtonProps, composeRenderProps } from 'react-aria-components'
import { cls } from '../cls'

export type ButtonTone = 'primary' | 'ghost' | 'danger' | 'quiet'

export type ButtonProps = RACButtonProps & {
  tone?: ButtonTone
  icon?: React.ReactNode
}

export function Button({ tone = 'ghost', icon, ...props }: ButtonProps) {
  return (
    <RACButton
      {...props}
      className={composeRenderProps(props.className, (className) =>
        cls('rac-button', `rac-button--${tone}`, className),
      )}
      data-tone={tone}
    >
      {composeRenderProps(props.children, (children) => (
        <>
          {icon ? <span className="rac-button__icon">{icon}</span> : null}
          <span className="rac-button__label">{children}</span>
        </>
      ))}
    </RACButton>
  )
}
