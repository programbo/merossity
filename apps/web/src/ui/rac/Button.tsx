import { Button as RACButton, type ButtonProps as RACButtonProps, composeRenderProps } from 'react-aria-components'
import { cls } from '../cls'

export type ButtonTone = 'primary' | 'ghost' | 'danger' | 'quiet'

export type ButtonProps = RACButtonProps & {
  tone?: ButtonTone
  icon?: React.ReactNode
}

export function Button({ tone = 'ghost', icon, ...props }: ButtonProps) {
  const toneClass =
    tone === 'primary'
      ? cls(
          'border-[color:color-mix(in_srgb,var(--color-accent)_35%,transparent)]',
          'bg-[radial-gradient(120px_80px_at_30%_20%,rgba(255,255,255,0.16),transparent_55%),linear-gradient(180deg,rgba(255,106,0,0.95),rgba(255,106,0,0.72))]',
          'text-[color:rgba(11,16,32,0.92)]',
          'shadow-[0_30px_70px_rgba(255,106,0,0.15),0_30px_70px_rgba(0,0,0,0.35)]',
          'data-[hovered]:bg-[radial-gradient(120px_80px_at_30%_20%,rgba(255,255,255,0.18),transparent_55%),linear-gradient(180deg,rgba(255,130,51,0.98),rgba(255,106,0,0.76))]',
        )
      : tone === 'danger'
        ? cls(
            'border-[color:color-mix(in_srgb,var(--color-danger)_35%,transparent)]',
            'bg-[radial-gradient(120px_80px_at_30%_20%,rgba(255,255,255,0.14),transparent_55%),linear-gradient(180deg,rgba(255,59,59,0.92),rgba(255,59,59,0.68))]',
            'text-[color:rgba(11,16,32,0.92)]',
          )
        : tone === 'quiet'
          ? cls('bg-white/3 border-white/10 shadow-none', 'data-[hovered]:bg-white/6')
          : cls('bg-white/6 border-border', 'data-[hovered]:bg-white/9 data-[hovered]:border-border-2')

  return (
    <RACButton
      {...props}
      className={composeRenderProps(props.className, (className) =>
        cls(
          'inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-[12px] tracking-[0.16em] text-white/90 uppercase outline-none',
          'shadow-[0_24px_50px_rgba(0,0,0,0.35),0_1px_0_rgba(255,255,255,0.07)_inset]',
          'select-none [-webkit-tap-highlight-color:transparent]',
          'transition-[transform,background,border-color,color,box-shadow] duration-150 ease-out',
          'data-[pressed]:translate-y-px data-[pressed]:scale-[0.99]',
          'data-[focus-visible]:border-[color:color-mix(in_srgb,var(--color-accent-2)_35%,transparent)] data-[focus-visible]:ring-2 data-[focus-visible]:ring-[color:color-mix(in_srgb,var(--color-accent-2)_23%,transparent)]',
          'data-[disabled]:opacity-50',
          toneClass,
          className,
        ),
      )}
      data-tone={tone}
    >
      {composeRenderProps(props.children, (children) => (
        <>
          {icon ? <span className="inline-flex">{icon}</span> : null}
          {children !== null && children !== undefined ? <span>{children}</span> : null}
        </>
      ))}
    </RACButton>
  )
}
