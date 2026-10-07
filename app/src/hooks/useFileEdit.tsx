import { useCallback, useState } from "react";

export function useFileEdit(
  getter: () => Promise<string | undefined>,
  setter: (content: string) => Promise<unknown> | void,
) {
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  const loadFileContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getter();
      if (result) {
        setContent(result);
        setIsDirty(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getter]);

  // Resolves to true when the file was saved
  const saveFileContent = useCallback(async () => {
    setIsSaving(true);
    setSaveError(undefined);
    try {
      const result = (await setter(content)) as
        | { error?: unknown; message?: unknown }
        | undefined;

      if (result && typeof result === "object" && result.error) {
        setSaveError(String(result.error));
        return false;
      }

      setIsDirty(false);
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [content, setter]);

  return {
    content,
    setContent,
    isDirty,
    setIsDirty,
    isSaving,
    isLoading,
    saveError,
    loadFileContent,
    saveFileContent,
  };
}
