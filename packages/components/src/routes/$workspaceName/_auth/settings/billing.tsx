import { createFileRoute, Navigate } from '@tanstack/react-router';
import { BillingSettingsComponent } from '@/components/settings/lazy-settings-components';
import { isNativeAppShell } from '@/lib/native-platform';

export const Route = createFileRoute('/$workspaceName/_auth/settings/billing')({
  component: BillingSettingsRoute,
});

export function BillingSettingsRoute() {
  const { workspaceName } = Route.useParams();

  if (isNativeAppShell()) {
    return (
      <Navigate
        to="/$workspaceName/settings"
        params={{ workspaceName }}
        search={(previous) => previous}
        replace
      />
    );
  }

  return <BillingSettingsComponent />;
}
