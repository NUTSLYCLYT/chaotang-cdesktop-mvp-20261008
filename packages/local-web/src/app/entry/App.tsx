import { createAcceptanceChaotangClient } from '@web/app/chaotang/acceptanceChaotangClient';
import { RouterProvider } from '@tanstack/react-router';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { UserSystemProvider } from '@web/app/providers/ConfigProvider';
import { ClickedElementsProvider } from '@web/app/providers/ClickedElementsProvider';
import { localAppNavigation } from '@web/app/navigation/AppNavigation';
import { LocalAuthProvider } from '@/shared/providers/auth/LocalAuthProvider';
import { AppRuntimeProvider } from '@/shared/hooks/useAppRuntime';
import { AppNavigationProvider } from '@/shared/hooks/useAppNavigation';
import { useTauriNotificationNavigation } from '@web/app/hooks/useTauriNotificationNavigation';
import { useTauriUpdateReady } from '@web/app/hooks/useTauriUpdateReady';
import { AppSystemNotifications } from '@web/app/notifications/AppSystemNotifications';
import { router } from '@web/app/router';
import { ChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { tauriChaotangClient } from '@web/app/chaotang/tauriChaotangClient';

const chaotangClient =
  import.meta.env.DEV && import.meta.env.VITE_FUSION_ACCEPTANCE === '1'
    ? createAcceptanceChaotangClient(tauriChaotangClient, fetch, sessionStorage)
    : tauriChaotangClient;

function TauriListeners() {
  useTauriNotificationNavigation();
  useTauriUpdateReady();
  return null;
}

function App() {
  return (
    <AppRuntimeProvider runtime="local">
      <ChaotangProvider client={chaotangClient}>
        <AppNavigationProvider value={localAppNavigation}>
          <TauriListeners />
          <UserSystemProvider>
            <LocalAuthProvider>
              <AppSystemNotifications />
              <ClickedElementsProvider>
                <HotkeysProvider
                  initiallyActiveScopes={[
                    'global',
                    'workspace',
                    'kanban',
                    'projects',
                  ]}
                >
                  <RouterProvider router={router} />
                </HotkeysProvider>
              </ClickedElementsProvider>
            </LocalAuthProvider>
          </UserSystemProvider>
        </AppNavigationProvider>
      </ChaotangProvider>
    </AppRuntimeProvider>
  );
}

export default App;
