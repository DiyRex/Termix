/**
 * Platform identities for the badge shown beside a host's address.
 *
 * Distro logos aren't available from lucide and pulling in an icon pack for a
 * decorative badge isn't worth the bundle, so each platform gets a brand-tinted
 * tile with a short glyph — recognisable at 32px, which is all a row needs.
 */
export type HostOsId =
  | "ubuntu"
  | "debian"
  | "fedora"
  | "rhel"
  | "centos"
  | "arch"
  | "alpine"
  | "suse"
  | "linux"
  | "windows"
  | "macos"
  | "freebsd"
  | "raspberry"
  | "docker"
  | "kubernetes"
  | "router"
  | "cloud"
  | "generic";

export type HostOsSpec = {
  id: HostOsId;
  label: string;
  /** Empty means "fall back to a generic server icon". */
  glyph: string;
  color: string;
};

export const HOST_OS_OPTIONS: HostOsSpec[] = [
  { id: "generic", label: "Generic", glyph: "", color: "#64748b" },
  { id: "ubuntu", label: "Ubuntu", glyph: "U", color: "#e95420" },
  { id: "debian", label: "Debian", glyph: "D", color: "#a80030" },
  { id: "fedora", label: "Fedora", glyph: "F", color: "#294172" },
  { id: "rhel", label: "RHEL", glyph: "R", color: "#ee0000" },
  { id: "centos", label: "CentOS", glyph: "C", color: "#932279" },
  { id: "arch", label: "Arch", glyph: "A", color: "#1793d1" },
  { id: "alpine", label: "Alpine", glyph: "Al", color: "#0d597f" },
  { id: "suse", label: "SUSE", glyph: "S", color: "#30ba78" },
  { id: "linux", label: "Linux", glyph: "L", color: "#f5bd0c" },
  { id: "windows", label: "Windows", glyph: "W", color: "#0078d4" },
  { id: "macos", label: "macOS", glyph: "M", color: "#a2aaad" },
  { id: "freebsd", label: "FreeBSD", glyph: "B", color: "#ab2b28" },
  { id: "raspberry", label: "Raspberry Pi", glyph: "Pi", color: "#c51a4a" },
  { id: "docker", label: "Docker", glyph: "Dk", color: "#2496ed" },
  { id: "kubernetes", label: "Kubernetes", glyph: "K8", color: "#326ce5" },
  { id: "router", label: "Router", glyph: "Rt", color: "#0f766e" },
  { id: "cloud", label: "Cloud", glyph: "Cl", color: "#7c3aed" },
];

export function hostOsSpec(id: string | null | undefined): HostOsSpec {
  return (
    HOST_OS_OPTIONS.find((o) => o.id === id) ??
    HOST_OS_OPTIONS.find((o) => o.id === "generic")!
  );
}

/**
 * Guesses a platform from free text so an existing host shows something better
 * than the generic tile before anyone picks one. Callers must prefer a stored
 * value over this — it is a fallback, not an override.
 */
export function guessHostOs(...hints: (string | undefined | null)[]): HostOsId {
  const haystack = hints.filter(Boolean).join(" ").toLowerCase();
  const rules: [HostOsId, RegExp][] = [
    ["ubuntu", /ubuntu|noble|jammy|focal/],
    ["rhel", /ec2-user|amzn|amazon/],
    ["debian", /debian|bookworm|bullseye/],
    ["fedora", /fedora/],
    ["rhel", /rhel|red\s?hat/],
    ["centos", /centos|rocky|alma/],
    ["arch", /arch(linux)?|manjaro/],
    ["alpine", /alpine/],
    ["suse", /suse|opensuse/],
    ["raspberry", /raspberry|raspi|rpi/],
    ["kubernetes", /k8s|kube|k3s/],
    ["docker", /docker|podman/],
    ["windows", /windows|win(10|11|srv|server)/],
    ["macos", /macos|mac\s?os|darwin|osx/],
    ["freebsd", /freebsd|openbsd|netbsd|pfsense|opnsense/],
    ["router", /router|gateway|switch|firewall|mikrotik|ubiquiti/],
    ["cloud", /aws|ec2|azure|gcp|digitalocean|hetzner|linode|vultr/],
    ["linux", /linux/],
  ];
  for (const [id, re] of rules) if (re.test(haystack)) return id;
  return "generic";
}
