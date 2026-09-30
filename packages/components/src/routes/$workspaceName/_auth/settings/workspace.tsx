import { createFileRoute } from '@tanstack/react-router';
import { AccountSettingsComponent } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/workspace')({
  component: WorkspaceGeneralSettingsRoute,
});

function WorkspaceGeneralSettingsRoute() {
  return <AccountSettingsComponent surface="workspace" />;
}
