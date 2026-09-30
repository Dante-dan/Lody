import { createFileRoute } from '@tanstack/react-router';
import { AccountSettingsComponent } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/people')({
  component: PeopleSettingsRoute,
});

function PeopleSettingsRoute() {
  return <AccountSettingsComponent surface="workspace" />;
}
