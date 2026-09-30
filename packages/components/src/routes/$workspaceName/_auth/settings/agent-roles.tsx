import { createFileRoute } from '@tanstack/react-router';
import { AgentRolesSetting } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/agent-roles')({
  component: AgentRolesSetting,
});
