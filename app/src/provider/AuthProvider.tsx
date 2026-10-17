import React, {
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ROUTE_LOGIN } from "src/components/Security/PrivateRoute";
import {
  LOCALSTORAGE_REDIRECT_URL,
  LOCALSTORAGE_TOKEN_KEY,
} from "src/contants";
import { ApiReturnType, AuthType, CheckAuthType } from "src/types";

import { useApiFetcher } from "./ApiFetcherProvider";

type AuthContextType = {
  isAuthActive: boolean | undefined;
  authType: "password" | "oidc" | null;
  isAccessGranted: boolean;
  login: (password: string) => Promise<ApiReturnType | AuthType | void>;
  loginWithOIDC: () => void;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthActive, setIsAuthActive] = useState<boolean>();
  const [authType, setAuthType] = useState<"password" | "oidc" | null>(null);
  const { pathname } = useLocation();
  const {
    error,
    actions: { auth, is_auth_active },
  } = useApiFetcher();
  const navigate = useNavigate();

  const isAccessGranted = useMemo(
    () => !!localStorage.getItem(LOCALSTORAGE_TOKEN_KEY),
    [],
  );

  const redirectAfterLogin = useCallback(() => {
    const redirect = localStorage.getItem(LOCALSTORAGE_REDIRECT_URL);
    if (redirect) {
      localStorage.removeItem(LOCALSTORAGE_REDIRECT_URL);
      return navigate(redirect);
    }
    return navigate("/");
  }, [navigate]);

  const checkIfAuthIsActive = useCallback(async () => {
    if (isAuthActive !== undefined) return;

    const response = await is_auth_active();

    if (response && (response as CheckAuthType).isAuthActive !== undefined) {
      setIsAuthActive((response as CheckAuthType).isAuthActive);
      setAuthType((response as CheckAuthType).authType);
    }

    if (pathname === ROUTE_LOGIN) redirectAfterLogin();
  }, [isAuthActive, is_auth_active, pathname, redirectAfterLogin]);

  const login = async (password: string) => {
    const response = await auth(JSON.stringify({ password: password }));

    if ((response as AuthType)?.accessGranted) {
      if (typeof (response as AuthType)?.token === "string") {
        localStorage.setItem(
          LOCALSTORAGE_TOKEN_KEY,
          (response as AuthType)?.token || "",
        );
      }
      redirectAfterLogin();

      return;
    }

    // No answer at all: server error (5xx) or network failure
    return (
      response ?? {
        error: true,
        message: "Unable to reach the server. Please try again.",
      }
    );
  };

  const loginWithOIDC = useCallback(() => {
    window.location.href = "/api/auth/oidc/login";
  }, []);

  const logout = () => {
    localStorage.removeItem(LOCALSTORAGE_TOKEN_KEY);
    window.location.reload();
  };

  // Check for token in URL fragment (OIDC callback): a fragment is never sent
  // to the server, so the token stays out of access logs
  useEffect(() => {
    const readTokenFromHash = () => {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const token = hashParams.get("token");

      if (token) {
        localStorage.setItem(LOCALSTORAGE_TOKEN_KEY, token);
        // Clean URL (and the history entry holding the token)
        window.history.replaceState(
          {},
          "",
          window.location.pathname + window.location.search,
        );
        redirectAfterLogin();
      }
    };

    readTokenFromHash();
    // A same-page navigation to /#token=... doesn't remount the app
    window.addEventListener("hashchange", readTokenFromHash);
    return () => window.removeEventListener("hashchange", readTokenFromHash);
  }, [redirectAfterLogin]);

  useEffect(() => {
    if (error.apiError) {
      console.log("error", error);
      return;
    }

    const checkAuth = async () => {
      await checkIfAuthIsActive();
    };
    checkAuth();
  }, [checkIfAuthIsActive, error]);

  const value = {
    isAuthActive,
    authType,
    isAccessGranted,
    login,
    loginWithOIDC,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  return useContext(AuthContext);
};
