import { createFileRoute } from '@tanstack/react-router';
import { GeneralSettingsComponent } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/preferences')({
  component: GeneralSettingsComponent,
});
