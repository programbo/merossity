import {
  FieldError,
  Input,
  Label,
  Text,
  TextField as RACTextField,
  type TextFieldProps as RACTextFieldProps,
  composeRenderProps,
} from 'react-aria-components'
import { cls } from '../cls'

export type TextFieldProps = RACTextFieldProps & {
  label: string
  hint?: string
  placeholder?: string
  inputProps?: React.ComponentProps<typeof Input>
}

export function TextField({ label, hint, placeholder, inputProps, ...props }: TextFieldProps) {
  const { className: inputClassName, ...inputRest } = inputProps ?? {}
  return (
    <RACTextField
      {...props}
      className={composeRenderProps(props.className, (className) => cls('grid gap-2', className))}
    >
      <Label className="text-[11px] tracking-[0.16em] text-white/50 uppercase">{label}</Label>
      <Input
        {...inputRest}
        className={cls(
          'text-foreground h-11 w-full rounded-[var(--radius-md)] border border-white/15 bg-black/25 px-3 text-[13px] outline-none',
          'transition-[border-color,background,box-shadow] duration-150 ease-out [-webkit-tap-highlight-color:transparent]',
          'placeholder:text-white/35',
          'data-[focused]:border-[color:color-mix(in_srgb,var(--color-accent-2)_35%,transparent)] data-[focused]:bg-black/30 data-[focused]:ring-2 data-[focused]:ring-[color:color-mix(in_srgb,var(--color-accent-2)_16%,transparent)]',
          'focus-visible:border-[color:color-mix(in_srgb,var(--color-accent-2)_35%,transparent)] focus-visible:bg-black/30 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-accent-2)_16%,transparent)]',
          typeof inputClassName === 'string' ? inputClassName : '',
        )}
        placeholder={placeholder}
      />
      {hint ? (
        <Text slot="description" className="text-muted text-[13px] leading-snug">
          {hint}
        </Text>
      ) : null}
      <FieldError className="text-[13px] leading-snug text-[color:color-mix(in_srgb,var(--color-danger)_70%,white)]" />
    </RACTextField>
  )
}
