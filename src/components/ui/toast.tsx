'use client';

import * as ToastPrimitives from '@radix-ui/react-toast';
import { cn } from '@/lib/utils';

const ToastProvider = ToastPrimitives.Provider;
const ToastViewport = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>) => (
  <ToastPrimitives.Viewport
    className={cn(
      'fixed inset-x-3 bottom-3 z-[100] flex max-h-screen flex-col gap-2 sm:bottom-4 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm',
      className
    )}
    {...props}
  />
);
const Toast = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root>) => (
  <ToastPrimitives.Root
    className={cn(
      'rounded-2xl border border-orange-100 bg-white p-4 text-navy shadow-lift',
      className
    )}
    {...props}
  />
);
const ToastTitle = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>) => (
  <ToastPrimitives.Title className={cn('font-black', className)} {...props} />
);
const ToastDescription = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>) => (
  <ToastPrimitives.Description className={cn('text-sm text-muted', className)} {...props} />
);

export { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription };
