import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, CheckCircle2, Eraser } from "lucide-react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAssistantStore } from "@/stores/assistantStore";
import { useUIStore } from "@/stores/uiStore";
import { useAssistantNudges } from "@/hooks/useAssistant";
import { AssistantNudgeCard } from "./AssistantNudgeCard";
import { AssistantMessageList } from "./AssistantMessageList";
import { useContextualSuggestions } from "./useContextualSuggestions";
import { SuggestionChips } from "./ai-elements/SuggestionChips";
import { PromptInput } from "./ai-elements/PromptInput";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/Conversation";

/**
 * Right-side sheet hosting the assistant's nudges and streaming chat.
 * Lazy-mounted from AppShell on first open (this module pulls the whole
 * agents/AI SDK chain, ~a quarter of the entry chunk); the ⌘I shortcut lives in
 * AppShell so it works before this chunk has ever loaded.
 */
export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const markSeen = useAssistantStore((s) => s.markSeen);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const { nudges } = useAssistantNudges();
  const suggestions = useContextualSuggestions();
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // The structured, review-before-save path. Close the sheet first so the two
  // modals (sheet + dialog) don't stack their focus traps.
  const logTime = () => {
    setOpen(false);
    openQuickAdd();
  };

  const [input, setInput] = useState("");

  // One ChatAgent per workspace; the worker pins the instance to the caller's
  // workspace server-side, so a fixed name here is safe (see worker/index.ts).
  const agent = useAgent({ agent: "chat-agent", name: "assistant" });
  const {
    messages,
    sendMessage,
    status,
    stop,
    regenerate,
    clearHistory,
    addToolApprovalResponse,
    isStreaming,
  } = useAgentChat({
    agent,
    // Sent per request; ChatAgent.onChatMessage reads options.body for local time.
    body: () => ({ timezoneOffsetMinutes: new Date().getTimezoneOffset() }),
  });

  const busy = status === "submitted" || status === "streaming" || isStreaming;
  const lastAssistantId = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant")?.id,
    [messages]
  );

  // The assistant is "thinking" when a turn is in flight but no assistant text
  // has streamed in yet (covers the pre-first-token and tool round-trip gaps).
  const showThinking = useMemo(() => {
    if (!busy) return false;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const hasText = lastAssistant?.parts.some((p) => p.type === "text" && p.text.trim());
    return !hasText;
  }, [busy, messages]);

  // Viewing the panel counts as seeing every nudge in it — silences pending alerts.
  useEffect(() => {
    if (open && nudges.length) markSeen(nudges.map((n) => n.id));
  }, [open, nudges, markSeen]);

  const send = (content: string) => {
    const text = content.trim();
    if (!text || busy) return;
    setInput("");
    sendMessage({ text });
  };

  const approve = (id: string, approved: boolean) => addToolApprovalResponse({ id, approved });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        // Input-first: land ready to type instead of focusing the close button.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          promptRef.current?.focus();
        }}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Assistant
          </SheetTitle>
          <SheetDescription>
            Keeps an eye on your calendar and timesheet so billable time doesn't slip.
          </SheetDescription>
        </SheetHeader>

        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="p-4">
            {/* Nudges */}
            <div className="space-y-2">
              {nudges.length > 0 ? (
                nudges.map((n) => <AssistantNudgeCard key={n.id} nudge={n} />)
              ) : (
                <div className="flex items-center gap-2.5 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  All caught up — nothing needs your attention right now.
                </div>
              )}
            </div>

            {/* Conversation */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                {/* Shortcut to the structured, review-before-save entry form. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 rounded-full text-xs"
                  onClick={logTime}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Log time…
                </Button>
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                    onClick={() => clearHistory()}
                    disabled={busy}
                  >
                    <Eraser className="h-3.5 w-3.5" /> Clear chat
                  </Button>
                )}
              </div>

              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Ask about your day, or tell me to log time or track a meeting — or use
                    “Log time…” for a reviewable entry form.
                  </p>
                  <SuggestionChips suggestions={suggestions} onSelect={send} disabled={busy} />
                </div>
              )}

              <AssistantMessageList
                messages={messages}
                lastAssistantId={lastAssistantId}
                busy={busy}
                showThinking={showThinking}
                onApprove={approve}
                onRegenerate={() => regenerate()}
              />
            </div>
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t p-3">
          <PromptInput
            textareaRef={promptRef}
            value={input}
            onChange={setInput}
            onSubmit={send}
            onStop={() => stop()}
            busy={busy}
            status={status}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
