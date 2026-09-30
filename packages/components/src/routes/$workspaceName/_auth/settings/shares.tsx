import { createFileRoute } from '@tanstack/react-router';
import { ShareManagementSetting } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/shares')({
  component: ShareManagementSetting,
});
