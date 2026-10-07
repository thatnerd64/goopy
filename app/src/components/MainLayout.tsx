import { ReactNode, useEffect, useState } from "react";
import styled from "@emotion/styled";
import { AppBar, CircularProgress } from "@mui/material";
import { HistoryProvider } from "src/provider/HistoryProvider";
import { SearchProvider } from "src/provider/SearchProvider";
import { SyncProvider } from "src/provider/SyncProvider";

import { useConfigProvider } from "../provider/ConfigProvider";
import { ProcessingProvider } from "../provider/ProcessingProvider";

import { DialogChangelog } from "./Dialog/DialogChangelog";
import { DialogConfigError } from "./Dialog/DialogConfigError";
import { DialogNoAPI } from "./Dialog/DialogNoAPI";
import { DialogToken } from "./Dialog/DialogToken";
import { Footer } from "./Layout/Footer";
import { HeaderSearch } from "./Layout/HeaderSearch";
import { Logo } from "./Layout/Logo";
import { ProcessingButton } from "./Processing/ProcessingButton";
import { DocumentTitle } from "./DocumentTitle";

function MainLayout({ children }: { children: ReactNode }) {
  const [appLoaded, setAppLoaded] = useState(false);
  const {
    config,
    releaseData,
    actions: { checkAPI, checkForUpdates },
  } = useConfigProvider();

  useEffect(() => {
    function init() {
      if (!config) {
        checkAPI();
      }
      setAppLoaded(true);
    }
    init();
  }, [checkAPI, config]);

  useEffect(() => {
    if (!releaseData) checkForUpdates();
  }, [checkForUpdates, releaseData]);

  return (
    <Shell>
      <Main>
        <SearchProvider>
          <HistoryProvider>
            <ProcessingProvider>
              <DocumentTitle />
              <SyncProvider>
                <Content>
                  <AppBar id="app-bar" position="sticky">
                    <HeaderSearch />
                  </AppBar>
                  {!appLoaded || !config ? (
                    <Loader>
                      <Title>
                        <Logo size={36} />
                        Tidarr
                      </Title>
                      <CircularProgress size={28} />
                    </Loader>
                  ) : (
                    children
                  )}
                </Content>
                <ProcessingButton />
                <DialogToken />
                <DialogNoAPI />
                <DialogConfigError />
                <DialogChangelog />
              </SyncProvider>
            </ProcessingProvider>
          </HistoryProvider>
        </SearchProvider>
      </Main>
      <Footer />
    </Shell>
  );
}

export default MainLayout;

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
`;

const Main = styled.main`
  flex: 1 0 auto;
  width: 100%;
`;

const Content = styled.div`
  margin: 0;
`;

const Loader = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  justify-content: center;
  left: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
`;

const Title = styled.div`
  align-items: center;
  color: #eef1f6;
  display: flex;
  font-size: 1.75rem;
  font-weight: 800;
  gap: 0.75rem;
  letter-spacing: -0.02em;
`;
