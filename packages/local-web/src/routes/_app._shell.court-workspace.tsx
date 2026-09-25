import { createFileRoute } from '@tanstack/react-router';
import { CourtWorkspace } from '@/shared/components/chaotang/CourtWorkspace';
import { parseJobSearch } from '@/shared/components/chaotang/taskWorkspaceState';
import { useCallback } from 'react';
export const Route = createFileRoute('/_app/_shell/court-workspace')({
  validateSearch: parseJobSearch,
  component: CourtWorkspaceRoute,
});
function CourtWorkspaceRoute() {
  const { job } = Route.useSearch();
  const navigate = Route.useNavigate();
  const onSelectJob = useCallback(
    (job?: string, replace = false) => {
      void navigate({ search: job ? { job } : {}, replace });
    },
    [navigate]
  );
  return <CourtWorkspace selectedJobId={job} onSelectJob={onSelectJob} />;
}
