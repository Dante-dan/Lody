import { createFileRoute } from '@tanstack/react-router';
import { AppearanceSettingsComponent } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/appearance')({
  component: AppearanceSettingsComponent,
});
