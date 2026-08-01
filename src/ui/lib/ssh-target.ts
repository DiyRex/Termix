/**
 * Reads an ad-hoc SSH target out of the connect bar.
 *
 * The field advertises "or ssh user@hostname", so it has to accept a typed
 * target and not just filter saved hosts. Handles an optional leading `ssh`, an
 * optional `user@`, and either `:port` or `-p port`.
 *
 * Returns null when the text isn't a plausible target, which is what keeps
 * CONNECT disabled while someone is mid-search.
 */
export function parseSshTarget(
  input: string,
): { username: string; ip: string; port: number } | null {
  let rest = input.trim();
  if (!rest) return null;

  rest = rest.replace(/^ssh\s+/i, "");

  // `-p 2222` anywhere in the remainder.
  let port = 22;
  const portFlag = rest.match(/(?:^|\s)-p\s*(\d{1,5})(?=\s|$)/);
  if (portFlag) {
    port = Number(portFlag[1]);
    rest = rest.replace(portFlag[0], " ").trim();
  }

  // Anything left after the target (extra ssh flags) is not something this
  // shortcut should silently drop, so treat it as unparseable.
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length !== 1) return null;
  let target = parts[0];

  let username = "";
  const at = target.lastIndexOf("@");
  if (at !== -1) {
    username = target.slice(0, at);
    target = target.slice(at + 1);
  }

  // `host:port`, but not an IPv6 literal, which has many colons.
  const colon = target.indexOf(":");
  if (colon !== -1 && target.indexOf(":", colon + 1) === -1) {
    const maybePort = Number(target.slice(colon + 1));
    if (Number.isInteger(maybePort) && maybePort > 0 && maybePort <= 65535) {
      port = maybePort;
      target = target.slice(0, colon);
    }
  }

  // A hostname or IP: letters, digits, dots and dashes, and it must contain
  // something other than a dash or dot so "..." isn't a target.
  if (!/^[A-Za-z0-9._-]+$/.test(target)) return null;
  if (!/[A-Za-z0-9]/.test(target)) return null;
  if (port < 1 || port > 65535) return null;

  return { username, ip: target, port };
}
