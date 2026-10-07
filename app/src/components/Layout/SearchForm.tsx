import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SearchIcon from "@mui/icons-material/Search";
import { Box, InputAdornment, TextField } from "@mui/material";
import { useConfigProvider } from "src/provider/ConfigProvider";

const SEARCH_LABEL =
  "Tidal search (keywords, artist URL, album URL, playlist URL)";

export const SearchForm = () => {
  const [inputValue, setInputValue] = useState<string>();
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { pathname } = useLocation();
  const { config } = useConfigProvider();
  const params = useParams();
  const navigate = useNavigate();

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    setInputValue(e.target.value);
  }

  async function directDownload(url: string) {
    const id = url
      .substring(url.lastIndexOf("/") + 1, url.length)
      .split("?")?.[0];
    const splittedUrl = url.split("/");
    const type = splittedUrl[splittedUrl?.length - 2].split("?")?.[0];

    navigate(`/${type}/${id}`);
  }

  function performSearch(e: React.SyntheticEvent) {
    e.preventDefault();
    const target = e.target as typeof e.target & HTMLInputElement[];
    const searchString = target?.[0]?.value as string;

    if (searchString) {
      if (searchString.substring(0, 4) === "http") {
        directDownload(searchString);
        return;
      }
      navigate(`/search/${encodeURIComponent(searchString)}`);
      return;
    }

    navigate(`/`);
  }

  useEffect(() => {
    function updateInputValue() {
      if (pathname === "/") {
        setInputValue("");
        return;
      }
      if (params?.keywords) {
        setInputValue(decodeURIComponent(params.keywords));
      }
    }
    updateInputValue();
  }, [pathname, params]);

  // Press "/" anywhere (outside a text field) to jump to the search box
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable ||
        target?.closest(".monaco-editor")
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <search>
      <form onSubmit={performSearch}>
        <TextField
          id="search-input"
          placeholder="Search Tidal or paste a link…"
          value={inputValue || ""}
          variant="filled"
          hiddenLabel
          disabled={!config}
          fullWidth
          data-testid="search-input"
          margin="none"
          size="small"
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          inputRef={inputRef}
          slotProps={{
            htmlInput: { "aria-label": SEARCH_LABEL, autoComplete: "off" },
            input: {
              startAdornment: (
                <InputAdornment position="start" sx={{ mt: "0 !important" }}>
                  <SearchIcon
                    fontSize="small"
                    sx={{ color: "text.secondary" }}
                  />
                </InputAdornment>
              ),
              endAdornment:
                !isFocused && !inputValue ? (
                  <InputAdornment position="end" sx={{ mt: "0 !important" }}>
                    <Box
                      component="kbd"
                      aria-hidden="true"
                      sx={{
                        border: "1px solid rgba(255,255,255,.16)",
                        borderRadius: 1,
                        color: "text.secondary",
                        display: { xs: "none", md: "inline-block" },
                        fontFamily: "inherit",
                        fontSize: 12,
                        lineHeight: 1,
                        px: 0.75,
                        py: 0.5,
                      }}
                    >
                      /
                    </Box>
                  </InputAdornment>
                ) : undefined,
              sx: { py: 0, "& input": { py: "11px" } },
            },
          }}
        />
      </form>
    </search>
  );
};
