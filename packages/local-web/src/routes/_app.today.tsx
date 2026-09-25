import { createFileRoute } from '@tanstack/react-router';
import { PrimaryModulePage } from '@/shared/components/PrimaryModulePage';

export const Route = createFileRoute('/_app/today')({
  component: () => <PrimaryModulePage moduleId="today" />,
});
