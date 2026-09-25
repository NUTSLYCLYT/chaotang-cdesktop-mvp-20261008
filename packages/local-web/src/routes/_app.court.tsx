import { createFileRoute } from '@tanstack/react-router';
import { CourtTaskShell } from '@/shared/components/CourtTaskShell';

export const Route = createFileRoute('/_app/court')({
  component: CourtTaskShell,
});
