import { Sparkles } from "lucide-react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Spinner } from "@/components/ui/spinner";
import { ToolCard } from "./ai-elements/ToolCard";
import { AssistantMarkdown } from "./ai-elements/AssistantMarkdown";
import { MessageActions } from "./ai-elements/MessageActions";

type ChatMessage = ReturnType<typeof useAgentChat>["messages"][number];

interface AssistantMessageListProps {
  messages: ChatMessage[];
  lastAssistantId: string | undefined;
  busy: boolean;
  showThinking: boolean;
  onApprove: (id: string, approved: boolean) => void;
  onRegenerate: () => void;
}

/** Pure render of the conversation transcript — turn state and network calls live in AssistantPanel. */
export function AssistantMessageList({
  messages,
  lastAssistantId,
  busy,
  showThinking,
  onApprove,
  onRegenerate,
}: AssistantMessageListProps) {
  return (
    <>
      {messages.map((m) => (
        <div
          key={m.id}
          className={
            m.role === "user"
              ? "ml-8 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
              : "group mr-4 flex gap-2"
          }
        >
          {m.role === "assistant" && (
            <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            {m.parts.map((part, i) => {
              if (part.type === "text") {
                return m.role === "user" ? (
                  <span key={i}>{part.text}</span>
                ) : (
                  <AssistantMarkdown key={i} text={part.text} />
                );
              }
              if (typeof part.type === "string" && part.type.startsWith("tool-")) {
                return <ToolCard key={i} part={part} onApprove={onApprove} />;
              }
              return null;
            })}
            {m.role === "assistant" && (
              <MessageActions
                message={m}
                canRegenerate={m.id === lastAssistantId && !busy}
                onRegenerate={onRegenerate}
              />
            )}
          </div>
        </div>
      ))}

      {showThinking && (
        <div className="mr-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          <span>Thinking…</span>
        </div>
      )}
    </>
  );
}
