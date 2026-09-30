import { createFileRoute } from '@tanstack/react-router';
import { AccountSettingsComponent } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/account')({
  component: AccountSettingsComponent,
});
