import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

export const CourtDialogTitle = Dialog.Title;

/** Inline content preserves the court theme and never dismisses unsaved inputs. */
export function CourtBusinessDialog({
  children,
  className,
  onRestoreFocus,
}: {
  children: ReactNode;
  className: string;
  onRestoreFocus: () => void;
}) {
  return (
    <Dialog.Root open>
      <Dialog.Content
        asChild
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <section className={className}>{children}</section>
      </Dialog.Content>
    </Dialog.Root>
  );
}
