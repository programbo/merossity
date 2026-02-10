'use client'

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
  return (
    <RACTextField
      {...props}
      className={composeRenderProps(props.className, (className) => cls('rac-field', className))}
    >
      <Label className="rac-field__label">{label}</Label>
      <Input {...inputProps} className="rac-field__input" placeholder={placeholder} />
      {hint ? (
        <Text slot="description" className="rac-field__hint">
          {hint}
        </Text>
      ) : null}
      <FieldError className="rac-field__error" />
    </RACTextField>
  )
}
