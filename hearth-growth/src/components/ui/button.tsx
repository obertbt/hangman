import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  // モバイル前提のため、タップ領域は最低 44px を確保する
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-ember-700 text-white hover:bg-ember-800',
        secondary: 'bg-hearth-100 text-hearth-800 hover:bg-hearth-200',
        outline: 'border border-[--color-border] bg-transparent hover:bg-hearth-100/60',
        ghost: 'hover:bg-hearth-100/60',
        danger: 'bg-red-700 text-white hover:bg-red-800',
      },
      size: {
        sm: 'min-h-9 px-3 text-xs',
        md: '',
        lg: 'min-h-14 px-8 text-base',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, block, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
  );
}

export { buttonVariants };
