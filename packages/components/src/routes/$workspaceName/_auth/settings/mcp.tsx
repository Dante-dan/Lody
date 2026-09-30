import { createFileRoute } from '@tanstack/react-router';
import { McpSetting } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/mcp')({
  component: McpSetting,
});
