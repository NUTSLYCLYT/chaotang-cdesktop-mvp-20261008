import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

export function RootRedirectPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // The primary shell must be able to render before the local backend has
    // finished booting. Waiting for user-system config here leaves the native
    // window on a completely blank root route whenever that request is slow or
    // unavailable. Domain pages handle their own disconnected/preview states.
    void navigate({ to: '/court-workspace', replace: true });
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#07100c]">
      <p className="chaotang-title text-sm tracking-[0.18em] text-[#d6c17d]">
        正在进入朝堂…
      </p>
    </div>
  );
}
