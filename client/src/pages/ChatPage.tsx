import { useUser } from "@clerk/react";
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";


interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ documentName: string; pageNo?: number; text: string }>;
  timestamp: Date;
}

interface ChatPageProps {
  versionId: number;
}

export default function ChatPage({ versionId }: ChatPageProps) {
  const { user } = useUser();

  const chatMutation = trpc.chat.query.useMutation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);



  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendQuery = async () => {
    if (!query.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setIsLoading(true);

    try {
      // Create a placeholder assistant message for streaming
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Call the API using tRPC
      const response = await chatMutation.mutateAsync({
        versionId,
        message: query.trim(),
      });

      const responseText = response.response;
      const sources = response.sources;

      // Simulate streaming by revealing tokens one by one
      const tokens = responseText.split(" ");
      let currentText = "";
      for (let i = 0; i < tokens.length; i++) {
        currentText += (i === 0 ? "" : " ") + tokens[i];
        setMessages((prev) => prev.map(m => 
          m.id === assistantMessageId ? { ...m, content: currentText } : m
        ));
        // Add a small delay to simulate network latency/streaming
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      // Add sources at the end
      setMessages((prev) => prev.map(m => 
        m.id === assistantMessageId ? { ...m, sources } : m
      ));

    } catch (error: any) {
      console.error("[ChatPage] Mutation error:", error);
      const errorMessage = error?.message || "Failed to get response";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div>
        <h2 className="text-2xl font-bold">Chat</h2>
        <p className="text-muted-foreground mt-1">Query your documents with AI-powered responses</p>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 border rounded-lg p-4 bg-muted/30">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <MessageCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No messages yet. Start a conversation!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-md px-4 py-2 rounded-lg ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border border-border"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <Streamdown>{message.content}</Streamdown>
                  ) : (
                    <p>{message.content}</p>
                  )}

                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                      <p className="text-xs font-semibold opacity-70">Sources:</p>
                      {message.sources.map((source, idx) => (
                        <div key={idx} className="text-xs opacity-75 bg-black/10 p-2 rounded">
                          <p className="font-medium">{source.documentName}</p>
                          {source.pageNo && <p>Page {source.pageNo}</p>}
                          <p className="line-clamp-2">{source.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-background border border-border px-4 py-2 rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="flex gap-2">
        <Input
          placeholder="Ask a question about your documents..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendQuery();
            }
          }}
          disabled={isLoading}
        />
        <Button
          onClick={handleSendQuery}
          disabled={isLoading || !query.trim()}
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
