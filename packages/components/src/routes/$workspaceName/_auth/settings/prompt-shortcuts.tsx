import { createFileRoute } from '@tanstack/react-router';
import { PromptShortcutsSetting } from '@/components/settings/lazy-settings-components';

export const Route = createFileRoute('/$workspaceName/_auth/settings/prompt-shortcuts')({
  component: PromptShortcutsSetting,
});
