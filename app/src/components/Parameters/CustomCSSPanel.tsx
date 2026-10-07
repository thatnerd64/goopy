import { useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Save } from "@mui/icons-material";
import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { useFileEdit } from "src/hooks/useFileEdit";
import { useApiFetcher } from "src/provider/ApiFetcherProvider";

import { ModuleTitle } from "../TidalModule/Title";

export default function CustomCSSPanel() {
  const {
    actions: { get_custom_css, set_custom_css },
  } = useApiFetcher();

  const {
    content,
    setContent,
    isDirty,
    setIsDirty,
    isSaving,
    isLoading,
    saveError,
    loadFileContent,
    saveFileContent,
  } = useFileEdit(get_custom_css, set_custom_css);

  useEffect(() => {
    loadFileContent();
  }, [loadFileContent]);

  const handleSave = async () => {
    // Stay on the page when the server refused the file (e.g. invalid TOML)
    if (await saveFileContent()) window.location.reload();
  };

  return (
    <Box>
      <ModuleTitle title="Custom CSS" />
      {isLoading ? (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            p: 2,
          }}
        >
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box
            sx={{
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 1,
            }}
          >
            <Editor
              height="350px"
              defaultLanguage="css"
              theme="vs-dark"
              value={content}
              onChange={(value) => {
                setContent(value || "");
                setIsDirty(true);
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </Box>
          {saveError && (
            <Alert severity="error" sx={{ mt: 2 }} role="alert">
              {saveError}
            </Alert>
          )}
          <Box
            sx={{
              textAlign: "right",
              my: 2,
            }}
          >
            <Button
              variant="contained"
              onClick={handleSave}
              startIcon={<Save />}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? <CircularProgress size={24} /> : "Save & Reload"}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
