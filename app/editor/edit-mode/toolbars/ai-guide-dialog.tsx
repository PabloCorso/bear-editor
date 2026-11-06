import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CaretRightIcon,
  CheckIcon,
  CopyIcon,
  DotsThreeVerticalIcon,
  OpenAiLogoIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button, IconButton } from "~/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  type DialogProps,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { ToolButton } from "~/components/tool-button";
import { isUserTyping } from "~/editor/helpers/event-handler";
import { cn } from "~/utils/misc";
import { AI_PROMPT_GROUPS, type AiPrompt } from "./ai-prompts";
import {
  isAiPromptLibraryShortcut,
  OPEN_AI_PROMPT_LIBRARY_SHORTCUT,
} from "./keyboard-shortcuts";

const AI_PROMPTS = AI_PROMPT_GROUPS.flatMap<AiPrompt>((group) => group.prompts);

export function AiGuideControl() {
  const [open, setOpen] = useState(false);

  useEffect(function registerAiPromptLibraryShortcut() {
    const controller = new AbortController();

    window.addEventListener(
      "keydown",
      (event: KeyboardEvent) => {
        if (!isAiPromptLibraryShortcut(event)) return;
        if (isUserTyping() || event.repeat) return;

        event.preventDefault();
        setOpen(true);
      },
      { signal: controller.signal },
    );

    return function cleanupAiPromptLibraryShortcut() {
      controller.abort();
    };
  }, []);

  return (
    <>
      <ToolButton
        name="AI Prompt Library"
        shortcut={OPEN_AI_PROMPT_LIBRARY_SHORTCUT}
        tooltipSide="right"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <SparkleIcon />
      </ToolButton>
      <AiGuideDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function AiGuideDialog(props: DialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent className="h-[min(42rem,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-4xl">
        <DialogHeader showCloseButton>
          <div>
            <DialogTitle>AI Prompt Library</DialogTitle>
            <DialogDescription className="mt-0.5 text-secondary">
              Copy a prompt into an AI app, then paste its result onto the
              canvas.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="min-h-0 overflow-hidden pb-6 text-base sm:px-0 sm:pb-0">
          <PromptLibrary />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function PromptLibrary() {
  const [promptId, setPromptId] = useState(AI_PROMPTS[0].id);
  const [showPromptOnSmallScreen, setShowPromptOnSmallScreen] = useState(false);
  const prompt =
    AI_PROMPTS.find((candidate) => candidate.id === promptId) ?? AI_PROMPTS[0];

  function selectPrompt(id: string) {
    setPromptId(id);
    setShowPromptOnSmallScreen(true);
  }

  return (
    <>
      <div className="h-full min-h-0 sm:hidden">
        {showPromptOnSmallScreen ? (
          <div className="h-full min-h-0">
            <PromptDetail
              prompt={prompt}
              onBack={() => setShowPromptOnSmallScreen(false)}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <CompactPromptGroups onSelect={selectPrompt} />
          </div>
        )}
      </div>

      <div className="hidden h-full min-h-0 grid-cols-[15rem_minmax(0,1fr)] bg-screen sm:grid">
        <aside className="space-y-5 px-4 pt-1 pb-5">
          {AI_PROMPT_GROUPS.map((group) => (
            <section key={group.id}>
              <p className="px-3 text-xs font-medium text-secondary">
                {group.label}
              </p>
              <div className="mt-1 space-y-0.5">
                {group.prompts.map((candidate) => (
                  <button
                    key={candidate.id}
                    className={cn(
                      "w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors",
                      candidate.id === prompt.id
                        ? "bg-primary font-bold text-primary"
                        : "hover:bg-primary/50",
                    )}
                    onClick={() => setPromptId(candidate.id)}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <main className="min-h-0 min-w-0 overflow-hidden rounded-tl-xl bg-primary/30 p-6 pt-5">
          <PromptContent prompt={prompt} />
        </main>
      </div>
    </>
  );
}

function CompactPromptGroups({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {AI_PROMPT_GROUPS.map((group, index) => (
        <details
          key={group.id}
          className="group overflow-hidden rounded-lg bg-primary/30"
          open={index === 0}
        >
          <summary className="flex cursor-pointer list-none items-center px-4 py-3 text-sm font-bold marker:hidden">
            {group.label}
            <CaretRightIcon className="ml-auto size-4 text-secondary transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-2 pb-2">
            {group.prompts.map((prompt) => (
              <button
                key={prompt.id}
                className="flex w-full cursor-pointer items-center rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-primary/60"
                onClick={() => onSelect(prompt.id)}
              >
                {prompt.label}
                <CaretRightIcon className="ml-auto size-4 text-secondary" />
              </button>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function PromptDetail({
  prompt,
  onBack,
}: {
  prompt: AiPrompt;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Button
        size="sm"
        className="-ml-2 font-normal text-secondary"
        iconBefore={<ArrowLeftIcon />}
        onClick={onBack}
      >
        Prompt library
      </Button>
      <div className="min-h-0 flex-1">
        <PromptContent prompt={prompt} />
      </div>
    </div>
  );
}

function PromptContent({ prompt }: { prompt: AiPrompt }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <h2 className="text-xl font-bold">{prompt.label}</h2>
        <p className="mt-1 mb-5 text-sm text-secondary">{prompt.hint}</p>
      </div>
      <CopyableText text={prompt.prompt} />
    </div>
  );
}

function CopyableText({ text }: { text: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied");
    } catch {
      setStatus("Select the text above and copy it manually.");
    }
  }
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-primary">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
        {status && (
          <span role="status" className="mr-1 text-sm text-secondary">
            {status}
          </span>
        )}
        <IconButton
          size="sm"
          className="bg-screen/70 backdrop-blur-sm"
          aria-label={status === "Copied" ? "Copied" : "Copy prompt"}
          title="Copy prompt"
          onClick={() => void copy()}
        >
          {status === "Copied" ? <CheckIcon /> : <CopyIcon />}
        </IconButton>
        <OpenInAiMenu text={text} />
      </div>
      <pre
        tabIndex={0}
        className="h-full overflow-auto px-5 py-5 pr-24 font-mono text-sm leading-6 whitespace-pre-wrap select-text"
      >
        {text}
      </pre>
    </div>
  );
}

function OpenInAiMenu({ text }: { text: string }) {
  const providers = [
    {
      name: "ChatGPT",
      href: `https://chatgpt.com/?q=${encodeURIComponent(text)}`,
      icon: <OpenAiLogoIcon weight="fill" />,
    },
    {
      name: "Claude",
      href: `https://claude.ai/new?q=${encodeURIComponent(text)}`,
      icon: <ClaudeLogo />,
    },
    {
      name: "Gemini",
      href: `https://gemini.google.com/app?q=${encodeURIComponent(text)}`,
      icon: <GeminiLogo />,
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <IconButton
          size="sm"
          className="bg-screen/70 backdrop-blur-sm"
          aria-label="Open prompt in AI app"
          title="Open in AI app"
        >
          <DotsThreeVerticalIcon weight="bold" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        {providers.map((provider) => (
          <DropdownMenuItem
            key={provider.name}
            iconBefore={provider.icon}
            iconAfter={<ArrowUpRightIcon />}
            onClick={() =>
              window.open(provider.href, "_blank", "noopener,noreferrer")
            }
          >
            {provider.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClaudeLogo(props: React.ComponentProps<"svg">) {
  return (
    <svg {...props} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#D97757"
        d="M11 2h2l.5 7.3 4.9-5.5 1.4 1.4-5.5 4.9 7.7.9v2l-7.7.9 5.5 4.9-1.4 1.4-4.9-5.5L13 22h-2l-.5-7.3-4.9 5.5-1.4-1.4 5.5-4.9L2 13v-2l7.7-.9-5.5-4.9 1.4-1.4 4.9 5.5L11 2Z"
      />
    </svg>
  );
}

function GeminiLogo(props: React.ComponentProps<"svg">) {
  return (
    <svg {...props} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="gemini-gradient" x1="3" y1="21" x2="21" y2="3">
          <stop stopColor="#4E82EE" />
          <stop offset=".5" stopColor="#A45DEB" />
          <stop offset="1" stopColor="#E75A7C" />
        </linearGradient>
      </defs>
      <path
        fill="url(#gemini-gradient)"
        d="M12 2c.7 5.8 4.2 9.3 10 10-5.8.7-9.3 4.2-10 10-.7-5.8-4.2-9.3-10-10 5.8-.7 9.3-4.2 10-10Z"
      />
    </svg>
  );
}
