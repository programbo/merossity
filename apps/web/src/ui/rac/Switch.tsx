'use client'

import { Switch as RACSwitch, type SwitchProps as RACSwitchProps, composeRenderProps } from 'react-aria-components'

import { cls } from '../cls'

export type SwitchProps = Omit<RACSwitchProps, 'children'> & {
  label: string
  description?: string
}

export function Switch({ label, description, ...props }: SwitchProps) {
  return (
    <RACSwitch {...props} className={composeRenderProps(props.className, (className) => cls('rac-switch', className))}>
      {(renderProps) => (
        <>
          <span className={cls('rac-switch__track', renderProps.isSelected ? 'is-on' : 'is-off')}>
            <span className="rac-switch__handle" />
          </span>
          <span className="rac-switch__text">
            <span className="rac-switch__label">{label}</span>
            {description ? <span className="rac-switch__desc">{description}</span> : null}
          </span>
        </>
      )}
    </RACSwitch>
  )
}

