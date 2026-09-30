import { createFileRoute } from '@tanstack/react-router';
import { StatsSettingsComponent } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/ai-usage')({
  component: StatsSettingsComponent,
});
