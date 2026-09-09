import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { Button } from '@/ui/button';
import { ChatComposer } from '../chat/chat-composer';
import {
  insertPastedTextDraft,
  getPastedTextDraftsAfterInsertion,
  shouldCapturePastedTextDraft,
  type PastedTextDraft,
} from '@/lib/pasted-text-draft';
import { wrapPastedTextChipLabel } from '../mentions/mention-chips';
import { conversationTextFontSizeStyle } from './conversation-font-size-classes';
import { cn } from '@/lib/utils';
import type { ConversationFontSize } from '@/atoms/settings';

export type UserMessageEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: (drafts: PastedTextDraft[]) => void;
  isSaving: boolean;
  conversationFontSize: ConversationFontSize;
};

/** Edit/resend shares the normal composer's editable pasted-file controls. */
export function UserMessageEditor({
  value,
  onChange,
  onCancel,
  onSave,
  isSaving,
  conversationFontSize,
}: UserMessageEditorProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canSave = value.trim().length > 0 && !isSaving;

  const [drafts, setDrafts] = useState<PastedTextDraft[]>([]);
  // Put the caret at the end rather than selecting everything, so the common
  // case (appending a clarification) needs no extra click.
  const focusAtEnd = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <div
      className={cn(
        'flex w-[32rem] max-w-full flex-col',
        'rounded-2xl border border-foreground/[0.10] bg-background px-3 py-2.5',
        'shadow-[0_1px_2px_hsl(0_0%_0%/0.04),0_8px_24px_-16px_hsl(0_0%_0%/0.12)]',
        'transition-colors duration-150 focus-within:border-foreground/25',
        'dark:border-input-border/70 dark:bg-input/90 dark:focus-within:border-input-border'
      )}
      aria-busy={isSaving || undefined}
    >
      <ChatComposer
        promptRef={focusAtEnd}
        promptValue={value}
        promptStyle={conversationTextFontSizeStyle(conversationFontSize)}
        onPromptChange={onChange}
        promptDisabled={isSaving}
        primaryAction={null}
        autoResize
        pastedTextDrafts={drafts}
        onPastedTextDraftsChange={setDrafts}
        onPromptPaste={(event) => {
          const text = event.clipboardData.getData('text/plain');
          if (isSaving || !shouldCapturePastedTextDraft(text)) return;
          const start = event.currentTarget.selectionStart;
          const end = event.currentTarget.selectionEnd;
          const displayText = wrapPastedTextChipLabel(
            t('composer.pastedFileInlineLabel', '[Text file · {{charCount}} chars]', {
              charCount: text.length,
            })
          );
          const result = insertPastedTextDraft({
            currentValue: value,
            pastedText: text,
            displayText,
            selectionStart: start,
            selectionEnd: end,
          });
          if (!result) return;
          event.preventDefault();
          onChange(result.nextValue);
          setDrafts(
            getPastedTextDraftsAfterInsertion({
              drafts,
              draft: result.draft,
              editStart: start,
              editEnd: end,
            })
          );
        }}
        onPromptKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (!isSaving) onCancel();
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (canSave) onSave(drafts);
          }
        }}
        promptPlaceholder={t('sessions.editMessage', 'Edit message')}
      />
      <div className="mt-2 flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isSaving}
          onClick={onCancel}
          className="h-7 rounded-full px-3 text-xs font-normal text-muted-foreground hover:text-foreground"
        >
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canSave}
          onClick={() => onSave(drafts)}
          className={cn(
            'h-7 rounded-full px-3.5 text-xs font-medium shadow-xs transition-all',
            'bg-foreground text-background hover:bg-foreground/90 hover:text-background',
            'active:translate-y-[1px]'
          )}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {t('sessions.send', 'Send')}
        </Button>
      </div>
    </div>
  );
}
