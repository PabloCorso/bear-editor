import { useState } from "react";
import {
  ArrowUpRightIcon,
  CopyIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  type DialogProps,
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ToolButton } from "~/components/tool-button";
import { AI_EXAMPLES, AI_JSON_EXAMPLE } from "./ai-prompts";

export function AiGuideControl() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ToolButton
        name="Use AI with Bear Editor"
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
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-xl">
        <DialogHeader className="px-4 py-3" showCloseButton>
          <DialogTitle className="text-base">
            Use AI with Bear Editor
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="min-h-0 gap-4 overflow-y-auto px-4 pb-4 text-sm">
          <DialogDescription>
            Make geometry in your favorite AI, then copy its JSON and paste into
            the canvas with the Select tool. AI runs in your own chat.
          </DialogDescription>
          <Tabs defaultValue="image">
            <TabsList className="flex flex-wrap gap-0.5">
              {AI_EXAMPLES.map((example) => (
                <TabsTrigger
                  key={example.id}
                  value={example.id}
                  className="text-xs sm:text-xs"
                >
                  {example.label}
                </TabsTrigger>
              ))}
              <TabsTrigger value="json" className="text-xs sm:text-xs">
                JSON format
              </TabsTrigger>
            </TabsList>
            {AI_EXAMPLES.map((example) => (
              <TabsContent
                key={example.id}
                value={example.id}
                className="mt-3 space-y-3"
              >
                <p className="text-secondary">{example.hint}</p>
                <CopyableText
                  key={example.id}
                  text={example.prompt}
                  label="Copy prompt"
                  placeholder
                />
                <div className="flex flex-wrap gap-1">
                  <ProviderLink href="https://chatgpt.com/">
                    ChatGPT
                  </ProviderLink>
                  <ProviderLink href="https://claude.ai/new">
                    Claude
                  </ProviderLink>
                  <ProviderLink href="https://gemini.google.com/app">
                    Gemini
                  </ProviderLink>
                </div>
              </TabsContent>
            ))}
            <TabsContent value="json" className="mt-3 space-y-3">
              <p className="text-secondary">
                A reusable JSON example for your own prompts will be added here.
              </p>
              <CopyableText
                text={AI_JSON_EXAMPLE}
                label="Copy JSON"
                placeholder
              />
            </TabsContent>
          </Tabs>
          <p className="border-t border-default pt-3 text-xs text-secondary">
            Questions or a good prompt?{" "}
            <a
              className="underline underline-offset-2 hover:text-primary"
              href="https://discord.com/channels/207629806513160192/531257164451414018"
              target="_blank"
              rel="noreferrer"
            >
              Ask or share on Discord{" "}
              <ArrowUpRightIcon className="inline size-3" />
            </a>
          </p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function CopyableText({
  text,
  label,
  placeholder = false,
}: {
  text: string;
  label: string;
  placeholder?: boolean;
}) {
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
    <div className="space-y-2">
      <pre
        tabIndex={0}
        className="max-h-48 overflow-auto rounded-md border border-default bg-primary p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text"
      >
        {text}
      </pre>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="accent"
          iconBefore={<CopyIcon />}
          disabled={placeholder}
          onClick={() => void copy()}
        >
          {label}
        </Button>
        <span role="status" className="text-xs text-secondary">
          {status}
        </span>
      </div>
    </div>
  );
}

function ProviderLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      as="a"
      href={href}
      target="_blank"
      rel="noreferrer"
      size="sm"
      iconAfter={<ArrowUpRightIcon />}
    >
      {children}
    </Button>
  );
}
