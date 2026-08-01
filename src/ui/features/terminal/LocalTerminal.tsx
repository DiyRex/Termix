import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useXTerm } from "react-xtermjs";
import { FitAddon } from "@xterm/addon-fit";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { isElectron } from "@/lib/electron";
import { useTheme } from "@/components/theme-provider";
import {
  getDefaultTerminalTheme,
  resolveTermixThemeColors,
} from "@/features/terminal/terminal-theme";
import { DEFAULT_TERMINAL_CONFIG, TERMINAL_FONTS } from "@/lib/terminal-themes";
import { ensureTerminalFontsLoaded } from "@/features/terminal/terminal-global-styles";
import { LOCAL_TERMINAL_WS_PORT } from "@/features/terminal/local-terminal-port";

export interface LocalTerminalHandle {
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  isConnected: () => boolean;
  sendInput: (data: string) => void;
  fit: () => void;
  notifyResize: () => void;
  focus: () => void;
}

interface LocalTerminalProps {
  instanceId: string;
  isVisible: boolean;
  onClose?: () => void;
  onTitleChange?: (title: string) => void;
}

type ServerMessage = {
  type: "connected" | "data" | "exit" | "error" | "title";
  data?: unknown;
};

/**
 * A shell on the machine running Termix — no host, no SSH.
 *
 * The PTY lives in the local backend process rather than the renderer, which is
 * the only place with a real process tree to spawn into. That backend refuses
 * the socket unless it is the embedded desktop one, so a hosted Termix can
 * never hand out a shell on the server.
 */
export const LocalTerminal = forwardRef<
  LocalTerminalHandle,
  LocalTerminalProps
>(function LocalTerminal(
  { instanceId, isVisible, onClose, onTitleChange },
  ref,
) {
  const { t } = useTranslation();
  const { theme: appTheme } = useTheme();
  const { instance: terminal, ref: xtermRef } = useXTerm();
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  // Set once the user has actually closed the shell, so an ordinary `exit`
  // doesn't read as a crash.
  const [exited, setExited] = useState(false);

  const supported = isElectron();

  const themeColors = useMemo(
    () => resolveTermixThemeColors(getDefaultTerminalTheme(), appTheme),
    [appTheme],
  ) as Record<string, string | undefined>;

  const write = useCallback(
    (text: string) => {
      terminal?.write(text);
    },
    [terminal],
  );

  useEffect(() => {
    if (!terminal) return;
    const fontConfig = TERMINAL_FONTS.find(
      (f) => f.value === DEFAULT_TERMINAL_CONFIG.fontFamily,
    );
    ensureTerminalFontsLoaded(fontConfig?.value ?? TERMINAL_FONTS[0].value);
    terminal.options.theme = {
      background: themeColors.background,
      foreground: themeColors.foreground,
      cursor: themeColors.cursor,
      cursorAccent: themeColors.cursorAccent,
      selectionBackground: themeColors.selectionBackground,
      selectionForeground: themeColors.selectionForeground,
      black: themeColors.black,
      red: themeColors.red,
      green: themeColors.green,
      yellow: themeColors.yellow,
      blue: themeColors.blue,
      magenta: themeColors.magenta,
      cyan: themeColors.cyan,
      white: themeColors.white,
      brightBlack: themeColors.brightBlack,
      brightRed: themeColors.brightRed,
      brightGreen: themeColors.brightGreen,
      brightYellow: themeColors.brightYellow,
      brightBlue: themeColors.brightBlue,
      brightMagenta: themeColors.brightMagenta,
      brightCyan: themeColors.brightCyan,
      brightWhite: themeColors.brightWhite,
    };
    terminal.options.fontFamily =
      fontConfig?.fallback ?? TERMINAL_FONTS[0].fallback;
    terminal.options.fontSize = DEFAULT_TERMINAL_CONFIG.fontSize;
  }, [terminal, appTheme, themeColors]);

  const buildWsUrl = useCallback(() => {
    // Always loopback: a local console is by definition a shell on this
    // machine, so it never routes through a remote Termix server.
    const token = localStorage.getItem("jwt");
    const base = `ws://127.0.0.1:${LOCAL_TERMINAL_WS_PORT}`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }, []);

  const sendResize = useCallback(() => {
    if (!terminal || wsRef.current?.readyState !== WebSocket.OPEN) return;
    const { cols, rows } = terminal;
    if (!cols || !rows) return;
    const last = lastSizeRef.current;
    if (last && last.cols === cols && last.rows === rows) return;
    lastSizeRef.current = { cols, rows };
    wsRef.current.send(
      JSON.stringify({ type: "resize", data: { cols, rows } }),
    );
  }, [terminal]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "disconnect" }));
      }
      ws.close();
      wsRef.current = null;
    }
    connectedRef.current = false;
    lastSizeRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (!terminal) return;
    disconnect();
    setExited(false);

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "connect",
          data: { cols: terminal.cols, rows: terminal.rows },
        }),
      );
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "connected":
          connectedRef.current = true;
          lastSizeRef.current = null;
          sendResize();
          break;
        case "data":
          if (typeof msg.data === "string") write(msg.data);
          break;
        case "title":
          if (typeof msg.data === "string" && msg.data)
            onTitleChange?.(msg.data);
          break;
        case "exit":
          connectedRef.current = false;
          setExited(true);
          write(`\r\n\x1b[33m${t("localTerminal.exited")}\x1b[0m\r\n`);
          break;
        case "error":
          connectedRef.current = false;
          write(
            `\r\n\x1b[31m${t("localTerminal.error")}: ${String(msg.data ?? "")}\x1b[0m\r\n`,
          );
          break;
      }
    };

    ws.onclose = () => {
      connectedRef.current = false;
    };

    ws.onerror = () => {
      connectedRef.current = false;
      write(`\r\n\x1b[31m${t("localTerminal.wsError")}\x1b[0m\r\n`);
    };
  }, [buildWsUrl, disconnect, onTitleChange, sendResize, t, terminal, write]);

  const fit = useCallback(() => {
    try {
      fitAddonRef.current?.fit();
    } catch {
      // xterm throws when the container has no layout yet.
    }
    sendResize();
  }, [sendResize]);

  useImperativeHandle(ref, () => ({
    connect,
    disconnect,
    reconnect: () => {
      terminal?.reset();
      connect();
    },
    isConnected: () => connectedRef.current,
    sendInput: (data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    },
    fit,
    notifyResize: fit,
    focus: () => terminal?.focus(),
  }));

  useEffect(() => {
    if (!terminal || !supported) return;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.options.cursorBlink = DEFAULT_TERMINAL_CONFIG.cursorBlink;
    terminal.options.scrollback = DEFAULT_TERMINAL_CONFIG.scrollback;

    const dataSub = terminal.onData((data) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "input", data }));
    });
    const resizeSub = terminal.onResize(() => sendResize());

    connect();

    return () => {
      dataSub.dispose();
      resizeSub.dispose();
      disconnect();
    };
    // Reconnecting on every `connect` identity change would tear down the
    // shell on unrelated re-renders; the tab's instanceId is the real key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal, instanceId, supported]);

  useEffect(() => {
    if (!isVisible) return;
    fit();
    terminal?.focus();
  }, [isVisible, fit, terminal]);

  useEffect(() => {
    if (!containerRef.current || !terminal) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [terminal, fit]);

  if (!supported) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
        <div className="size-10 rounded-full bg-muted/40 flex items-center justify-center">
          <TriangleAlert className="size-5 text-muted-foreground/50" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">
            {t("localTerminal.notSupportedTitle")}
          </span>
          <span className="text-xs text-muted-foreground max-w-xs">
            {t("localTerminal.notSupported")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      // 3px inset, with the terminal's own background behind it so it reads as
      // padding rather than a frame.
      className="relative flex h-full w-full p-[3px]"
      style={{ backgroundColor: themeColors.background }}
    >
      <div ref={xtermRef} className="min-h-0 flex-1" />
      {exited && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <button
            onClick={() => {
              terminal?.reset();
              connect();
            }}
            className="rounded-md bg-surface px-2.5 py-1 text-xs text-foreground shadow-sm hover:bg-muted"
          >
            {t("localTerminal.restart")}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md bg-surface px-2.5 py-1 text-xs text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
            >
              {t("nav.close")}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
