import { FormEvent, useEffect, useRef, useState } from "react";
import { Key } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Modal,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "src/provider/AuthProvider";
import { ApiReturnType } from "src/types";
import { surface } from "src/utils/theme";

import { Logo } from "../Layout/Logo";

export const AuthModal = () => {
  const refInput = useRef<HTMLInputElement>(null);
  const [authError, setAuthError] = useState<boolean | string>(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, loginWithOIDC, authType } = useAuth();

  // This screen has a single purpose: put the cursor in the password field
  useEffect(() => {
    refInput.current?.focus();
  }, [authType]);

  async function submitForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setAuthError(false);
    const data = new FormData(e.currentTarget);
    const response = await login(data.get("password")?.toString() || "");

    if ((response as ApiReturnType)?.message) {
      setAuthError((response as ApiReturnType).message);
    }

    setIsLoading(false);
  }

  return (
    <Modal
      open
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
      slotProps={{
        backdrop: {
          sx: {
            background: `radial-gradient(900px 480px at 15% 0%, rgba(61,217,195,.16), transparent 60%), radial-gradient(800px 460px at 90% 100%, rgba(167,139,250,.16), transparent 60%), ${surface.background}`,
            backdropFilter: "none",
          },
        },
      }}
    >
      <Box
        sx={{
          bgcolor: "background.paper",
          border: `1px solid ${surface.borderStrong}`,
          borderRadius: 5,
          boxShadow: "0 40px 80px -30px rgba(0,0,0,.9)",
          left: "50%",
          maxWidth: "23rem",
          outline: "none",
          overflow: "hidden",
          position: "absolute",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "92%",
        }}
      >
        <Box
          sx={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            pb: 2,
            pt: 4,
            px: 4,
          }}
        >
          <Logo size={52} />
          <Typography
            id="modal-modal-title"
            variant="h3"
            component="h2"
            sx={{ textAlign: "center" }}
          >
            Tidarr authentication
          </Typography>
        </Box>
        {authError && (
          <Alert severity="error" sx={{ mx: 4, mb: 1 }} role="alert">
            {authError}
          </Alert>
        )}
        <Box id="modal-modal-description" sx={{ pb: 4, pt: 1.5, px: 4 }}>
          {authType === "password" && (
            <form
              onSubmit={(e) => submitForm(e)}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <TextField
                inputRef={refInput}
                id="password"
                name="password"
                type="password"
                placeholder="Password..."
                autoComplete="current-password"
                fullWidth
                slotProps={{ htmlInput: { "aria-label": "Password" } }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isLoading}
                fullWidth
              >
                {isLoading ? "Loading..." : "Submit"}
              </Button>
            </form>
          )}
          {authType === "oidc" && (
            <Button
              endIcon={<Key />}
              variant="contained"
              size="large"
              onClick={loginWithOIDC}
              fullWidth
            >
              Login with OpenID
            </Button>
          )}
        </Box>
      </Box>
    </Modal>
  );
};
