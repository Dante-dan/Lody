import { createFileRoute } from '@tanstack/react-router';
import { IntegrationsSettingsComponent } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/github')({
  component: IntegrationsSettingsComponent,
});
