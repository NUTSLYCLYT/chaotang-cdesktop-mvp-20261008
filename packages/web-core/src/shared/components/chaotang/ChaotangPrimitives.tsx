import {
  CircleNotchIcon,
  InfoIcon,
  WarningIcon,
  type Icon,
} from '@phosphor-icons/react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ChaotangButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function ChaotangButton({
  variant = 'secondary',
  className,
  ...props
}: ChaotangButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-9 items-center justify-center gap-half border px-base text-sm font-medium tracking-wide transition-all active:translate-y-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-primary disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0',
        variant === 'primary' &&
          'chaotang-jade-glow border-brand/70 bg-[#d8d8c6] text-[#211e15] hover:bg-[#eee9d5]',
        variant === 'secondary' &&
          'border-brand/30 bg-panel/75 text-normal hover:border-brand/60 hover:bg-brand/10 hover:text-high',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-low hover:border-brand/20 hover:text-normal',
        variant === 'danger' &&
          'border-error/50 bg-error/10 text-error hover:bg-error/20',
        className
      )}
      {...props}
    />
  );
}

interface ChaotangPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  framed?: boolean;
}

export function ChaotangPanel({
  children,
  framed = true,
  className,
  ...props
}: ChaotangPanelProps) {
  return (
    <div
      className={cn(
        'chaotang-panel',
        framed && 'chaotang-corner-frame',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ChaotangSectionTitle({
  eyebrow,
  children,
  className,
}: {
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-base', className)}>
      <span className="h-px w-8 bg-gradient-to-r from-transparent to-brand/60" />
      <div>
        {eyebrow && (
          <p className="mb-1 text-[9px] uppercase tracking-[0.24em] text-brand/65">
            {eyebrow}
          </p>
        )}
        <h2 className="chaotang-title text-lg font-medium text-high">
          {children}
        </h2>
      </div>
      <span className="h-px flex-1 bg-gradient-to-r from-brand/60 to-transparent" />
    </div>
  );
}

export function ChaotangModuleHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  aside,
}: {
  icon?: Icon;
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-double border-b border-brand/15 pb-double">
      <div className="flex min-w-0 items-start gap-base">
        {Icon && (
          <div className="shrink-0 border border-brand/35 bg-brand/10 p-base text-brand">
            <Icon className="size-6" weight="duotone" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[9px] tracking-[0.24em] text-brand/55">
            {eyebrow}
          </p>
          <h1 className="chaotang-title mt-half text-2xl text-high">{title}</h1>
          <p className="mt-base max-w-3xl text-sm leading-relaxed text-low">
            {description}
          </p>
        </div>
      </div>
      {aside}
    </div>
  );
}

export function ChaotangEmptyState({
  title = '当前没有可展示的记录',
  description,
  icon: Icon = InfoIcon,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: Icon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-44 flex-col items-center justify-center border border-dashed border-brand/20 bg-primary/30 px-double py-double text-center',
        className
      )}
    >
      <Icon className="size-6 text-brand/65" weight="duotone" />
      <p className="chaotang-title mt-base text-base text-high">{title}</p>
      {description && (
        <p className="mt-half max-w-xl text-xs leading-relaxed text-low">
          {description}
        </p>
      )}
      {action && <div className="mt-base">{action}</div>}
    </div>
  );
}

export function ChaotangLoadingState({
  label = '正在读取真实数据…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-44 items-center justify-center border border-brand/15 bg-panel/60 text-xs text-low',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <CircleNotchIcon className="mr-half size-5 animate-spin text-brand" />
      {label}
    </div>
  );
}

export function ChaotangErrorState({
  title = '数据读取失败',
  message,
  action,
  className,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <ChaotangPanel
      className={cn('p-double text-center', className)}
      role="alert"
    >
      <WarningIcon className="mx-auto size-6 text-error" weight="duotone" />
      <p className="chaotang-title mt-base text-lg text-error">{title}</p>
      {message && (
        <p className="mx-auto mt-half max-w-2xl text-xs leading-relaxed text-low">
          {message}
        </p>
      )}
      {action && <div className="mt-base">{action}</div>}
    </ChaotangPanel>
  );
}

export function ChaotangMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="min-w-0 border border-brand/15 bg-primary/40 p-base">
      <p className="truncate text-xs text-low">{label}</p>
      <p className="chaotang-title mt-half break-words text-2xl text-brand">
        {value}
      </p>
      {detail && <p className="mt-half text-[9px] text-low">{detail}</p>}
    </div>
  );
}
