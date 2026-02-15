import { Switch as RACSwitch, type SwitchProps as RACSwitchProps, composeRenderProps } from 'react-aria-components'
import { cls } from '../cls'

export type SwitchProps = Omit<RACSwitchProps, 'children'> & {
  label: string
  description?: string
}

export function Switch({ label, description, ...props }: SwitchProps) {
  return (
    <RACSwitch
      {...props}
      className={composeRenderProps(props.className, (className) =>
        cls(
          'inline-flex items-center gap-3 select-none [-webkit-tap-highlight-color:transparent]',
          'data-[disabled]:opacity-50',
          className,
        ),
      )}
    >
      {(renderProps) => (
        <>
          <span
            className={cls(
              'inline-flex h-[26px] w-[46px] items-center rounded-full border border-white/15 bg-white/5 p-0.5',
              'transition-[border-color,background,box-shadow] duration-150 ease-out',
              renderProps.isSelected
                ? 'border-[color:color-mix(in_srgb,var(--color-accent-2)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--color-accent-2)_10%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent-2)_10%,transparent)]'
                : '',
              renderProps.isFocusVisible
                ? 'border-[color:color-mix(in_srgb,var(--color-accent)_35%,transparent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]'
                : '',
            )}
          >
            <span
              className={cls(
                'h-[22px] w-[22px] rounded-full bg-white/85',
                'transition-transform duration-[180ms] ease-out',
                renderProps.isSelected ? 'translate-x-[20px]' : 'translate-x-0',
              )}
            />
          </span>
          <span className="grid gap-0.5">
            <span className="text-[12px] tracking-[0.14em] text-white/90 uppercase">{label}</span>
            {description ? <span className="text-muted text-[12px]">{description}</span> : null}
          </span>
        </>
      )}
    </RACSwitch>
  )
}
