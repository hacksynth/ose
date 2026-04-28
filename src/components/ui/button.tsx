import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl text-center text-sm font-extrabold leading-tight transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-white shadow-soft hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-primary-dark',
        secondary: 'bg-white text-navy shadow-soft hover:-translate-y-0.5 hover:bg-primary-soft',
        ghost: 'text-navy hover:bg-primary-soft',
        muted: 'bg-gray-100 text-muted cursor-not-allowed',
      },
      size: {
        default: 'min-h-12 px-5 py-3',
        sm: 'min-h-10 px-4 py-2',
        lg: 'min-h-14 px-7 py-3 text-base',
        icon: 'h-11 w-11 shrink-0 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
