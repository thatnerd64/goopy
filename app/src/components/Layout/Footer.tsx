import { useNavigate } from "react-router-dom";
import styled from "@emotion/styled";
import { GitHub } from "@mui/icons-material";
import { Button, Link } from "@mui/material";
import { TIDARR_REPO_URL } from "src/contants";
import { useConfigProvider } from "src/provider/ConfigProvider";
import { customColors } from "src/utils/theme";

export const Footer = () => {
  const { isUpdateAvailable, config } = useConfigProvider();
  const navigate = useNavigate();

  return (
    <Support className="footer">
      <span>
        Private use only. Support your local artists{" "}
        <span aria-hidden="true">🙏❤️</span>
      </span>
      <Dot aria-hidden="true">•</Dot>
      <span>Tidarr</span>
      {config?.TIDARR_VERSION && (
        <>
          <Dot aria-hidden="true">•</Dot>
          <span>{`v${config?.TIDARR_VERSION}`}</span>
        </>
      )}
      {isUpdateAvailable && (
        <>
          <Dot aria-hidden="true">•</Dot>
          <Button
            size="small"
            sx={{ color: customColors.alert, py: 0, minWidth: 0 }}
            onClick={() => navigate("/parameters")}
            color="warning"
          >
            <strong>Update available</strong>
          </Button>
        </>
      )}
      <Link
        href={`https://github.com/${TIDARR_REPO_URL}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Tidarr on GitHub"
        sx={{
          color: "text.secondary",
          display: "inline-flex",
          marginLeft: "0.75rem",
          "&:hover": { color: "text.primary" },
        }}
      >
        <GitHub fontSize="small" />
      </Link>
    </Support>
  );
};

const Dot = styled.span`
  opacity: 0.4;
  padding: 0 0.5rem;
`;

const Support = styled.footer`
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: #7d8696;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8rem;
  justify-content: center;
  line-height: 1.4;
  padding: 1rem 1rem 5.5rem;
  text-align: center;
  width: 100%;
`;
