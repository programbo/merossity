import * as React from 'react'
import { tv, type VariantProps, twMerge } from './utils'

type RadioBaseProps = React.InputHTMLAttributes<HTMLInputElement>

type RadioGroupContextValue = {
  name?: string
  value?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null)

const radioStyles = tv({
  base: 'h-4 w-4 rounded-full border border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-900',
  variants: {
    disabled: {
      true: 'cursor-not-allowed opacity-50',
      false: 'cursor-pointer',
    },
  },
  defaultVariants: {
    disabled: false,
  },
})

type RadioVariants = VariantProps<typeof radioStyles>

export type RadioProps = RadioBaseProps &
  RadioVariants & {
    value: string
  }

export type RadioGroupProps = {
  name?: string
  value?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  children: React.ReactNode
}

export function RadioGroup({ name, value, onValueChange, disabled, children }: RadioGroupProps) {
  const contextValue = React.useMemo(
    () => ({ name, value, onValueChange, disabled }),
    [name, value, onValueChange, disabled],
  )

  return <RadioGroupContext.Provider value={contextValue}>{children}</RadioGroupContext.Provider>
}

export function Radio({ className, disabled, value, ...props }: RadioProps) {
  const context = React.useContext(RadioGroupContext)
  const isDisabled = disabled ?? context?.disabled
  const isChecked = context?.value === value

  return (
    <input
      {...props}
      type="radio"
      name={context?.name}
      value={value}
      checked={isChecked}
      onChange={(event) => {
        props.onChange?.(event)
        context?.onValueChange?.(event.currentTarget.value)
      }}
      disabled={isDisabled}
      className={twMerge(radioStyles({ disabled: isDisabled }), className)}
    />
  )
}
