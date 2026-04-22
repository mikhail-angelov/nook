import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";

type PromptRequest =
  | {
      kind: "input";
      title: string;
      defaultValue: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: "confirm";
      title: string;
      resolve: (value: boolean) => void;
    };

type PromptOptions = {
  defaultValue?: string;
};

export type PromptApi = {
  prompt(title: string, options?: PromptOptions): Promise<string | null>;
  confirm(title: string): Promise<boolean>;
};

export function usePromptDialog(): [PromptApi, ReactNode] {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const prompt = useCallback<PromptApi["prompt"]>(
    (title, options) =>
      new Promise<string | null>((resolve) => {
        setInputValue(options?.defaultValue ?? "");
        setRequest({
          kind: "input",
          title,
          defaultValue: options?.defaultValue ?? "",
          resolve,
        });
        // Focus runs after the input is mounted on the next frame.
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }),
    [],
  );

  const confirm = useCallback<PromptApi["confirm"]>(
    (title) =>
      new Promise<boolean>((resolve) => {
        setRequest({ kind: "confirm", title, resolve });
      }),
    [],
  );

  const handleCancel = () => {
    if (!request) return;
    if (request.kind === "input") request.resolve(null);
    else request.resolve(false);
    setRequest(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!request) return;
    if (request.kind === "input") {
      request.resolve(inputValue);
    } else {
      request.resolve(true);
    }
    setRequest(null);
  };

  const modal: ReactNode = request ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-[420px] max-w-[90vw] rounded border border-border bg-background p-4 text-sm shadow-lg"
      >
        <div className="mb-3 font-medium">{request.title}</div>
        {request.kind === "input" ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleCancel();
            }}
            className="mb-3 w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground/40"
          />
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded border border-border px-3 py-1 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded border border-border bg-foreground px-3 py-1 text-sm text-background hover:opacity-90"
          >
            OK
          </button>
        </div>
      </form>
    </div>
  ) : null;

  return [{ prompt, confirm }, modal];
}
