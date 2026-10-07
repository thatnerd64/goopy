import { Link } from "react-router-dom";
import styled from "@emotion/styled";
import {
  Box,
  Container,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import { useAuth } from "src/provider/AuthProvider";
import { useConfigProvider } from "src/provider/ConfigProvider";
import { QualityType } from "src/types";

import AtmosFilterButton from "../Buttons/AtmosFilterButton";
import DisplayButton from "../Buttons/DisplayModeButton";
import LogoutButton from "../Buttons/LogoutButton";
import SettingsButton from "../Buttons/SettingsButton";

import { Logo } from "./Logo";
import { SearchForm } from "./SearchForm";

const QualityToggleButton = ({
  tooltip,
  label,
  value,
}: {
  tooltip: string;
  label: string;
  value: QualityType;
}) => {
  const { config } = useConfigProvider();
  const isQualityLocked = config?.LOCK_QUALITY === "true";

  return (
    <Tooltip title={tooltip}>
      <ToggleButton value={value} disabled={isQualityLocked} sx={{ px: 1.75 }}>
        {label}
      </ToggleButton>
    </Tooltip>
  );
};

export const HeaderSearch = () => {
  const { quality, actions } = useConfigProvider();
  const { isAuthActive } = useAuth();

  return (
    <Container maxWidth="lg" sx={{ px: { xs: 1.5, sm: 3 } }}>
      <Box
        sx={{
          alignItems: "center",
          display: "grid",
          gap: { xs: 1, md: 2 },
          gridTemplateAreas: {
            xs: '"logo actions" "search search" "quality quality"',
            md: '"logo search quality actions"',
          },
          gridTemplateColumns: {
            xs: "1fr auto",
            md: "auto minmax(0, 1fr) auto auto",
          },
          py: { xs: 1, md: 1.25 },
        }}
      >
        <Box sx={{ gridArea: "logo" }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <Title data-testid="logo">
              <Logo size={30} />
              <span>Tidarr</span>
            </Title>
          </Link>
        </Box>

        <Box sx={{ gridArea: "search", minWidth: 0 }}>
          <SearchForm />
        </Box>

        <Box sx={{ gridArea: "quality", minWidth: 0 }}>
          <ToggleButtonGroup
            color="primary"
            value={quality || "all"}
            fullWidth
            size="small"
            exclusive
            onChange={(_e, value) => value?.length && actions.setQuality(value)}
            aria-label="Quality"
          >
            <QualityToggleButton
              label="Low"
              value="low"
              tooltip="Download format: '.m4a' files, 96 kbps"
            />
            <QualityToggleButton
              label="Normal"
              value="normal"
              tooltip="Download format: '.m4a' files, 320 kbps"
            />
            <QualityToggleButton
              label="High"
              value="high"
              tooltip="Download format: '.flac' files, 16-bit, 44.1 kHz"
            />
            <QualityToggleButton
              label="Max"
              value="max"
              tooltip="Download format: '.flac' files, Up to 24-bit, 192 kHz"
            />
          </ToggleButtonGroup>
        </Box>

        <Box
          sx={{
            alignItems: "center",
            display: "flex",
            gap: 0.25,
            gridArea: "actions",
            justifyContent: "flex-end",
          }}
        >
          <AtmosFilterButton />
          <DisplayButton />
          <SettingsButton />
          {isAuthActive && <LogoutButton />}
        </Box>
      </Box>
    </Container>
  );
};

const Title = styled.h1`
  align-items: center;
  color: #eef1f6;
  display: flex;
  font-size: 1.25rem;
  font-weight: 800;
  gap: 0.6rem;
  letter-spacing: -0.02em;
  margin: 0;
  transition: opacity 200ms ease;

  &:hover {
    opacity: 0.85;
  }

  svg {
    flex: 0 0 auto;
  }
`;
