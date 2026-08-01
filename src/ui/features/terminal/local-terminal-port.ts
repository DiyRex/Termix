/**
 * Port for the local-console websocket. Shared by the renderer and the backend
 * so the two can't drift; the next free port after the serial console (30011).
 */
export const LOCAL_TERMINAL_WS_PORT = 30012;
