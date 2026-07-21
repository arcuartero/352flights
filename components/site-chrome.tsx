"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

const SCAN_HOURS = [0, 12] as const;
const LUX_TIME_ZONE = "Europe/Luxembourg";

function getPageLabel(pathname: string) {
  if (pathname.startsWith("/ops/active-routes")) {
    return "Active Routes";
  }

  if (pathname.startsWith("/ops/email-campaigns")) {
    return "Email Campaigns";
  }

  if (pathname.startsWith("/ops/dates-scanner")) {
    return "Dates Scanner";
  }

  if (pathname.startsWith("/ops/scanner-live")) {
    return "Price Scanner";
  }

  if (pathname.startsWith("/ops/prices")) {
    return "Price intelligence";
  }

  if (pathname.startsWith("/ops")) {
    return "Operations board";
  }

  if (pathname.startsWith("/preferences")) {
    return "Subscriber setup";
  }

  return "Luxembourg edition";
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  function read(type: Intl.DateTimeFormatPartTypes) {
    return Number(parts.find((part) => part.type === type)?.value ?? "0");
  }

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function zonedDateTimeToUtcMs(
  timeZone: string,
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  },
) {
  const guess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const zonedGuess = getZonedParts(new Date(guess), timeZone);
  const desiredUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const observedUtc = Date.UTC(
    zonedGuess.year,
    zonedGuess.month - 1,
    zonedGuess.day,
    zonedGuess.hour,
    zonedGuess.minute,
    zonedGuess.second,
  );

  return guess + (desiredUtc - observedUtc);
}

function getNextScheduledScanMs(now: Date) {
  const luxNow = getZonedParts(now, LUX_TIME_ZONE);
  const nextHour = SCAN_HOURS.find((hour) => hour > luxNow.hour);

  if (nextHour !== undefined) {
    return zonedDateTimeToUtcMs(LUX_TIME_ZONE, {
      year: luxNow.year,
      month: luxNow.month,
      day: luxNow.day,
      hour: nextHour,
      minute: 0,
      second: 0,
    });
  }

  return zonedDateTimeToUtcMs(LUX_TIME_ZONE, {
    year: luxNow.year,
    month: luxNow.month,
    day: luxNow.day + 1,
    hour: SCAN_HOURS[0],
    minute: 0,
    second: 0,
  });
}

function formatCountdown(targetMs: number, nowMs: number) {
  const diffMs = Math.max(targetMs - nowMs, 0);
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

function formatHeaderTimestamp(value: string | null) {
  if (!value) {
    return "Waiting first run";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function NextScanCountdown() {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/ops/scanner-status", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { running?: boolean };
        if (!isMounted) {
          return;
        }

        setIsRunning(Boolean(payload.running));
      } catch {
        // Keep the header quiet if polling fails.
      }
    }

    void loadStatus();
    const interval = window.setInterval(loadStatus, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const countdown = useMemo(() => {
    const targetMs = getNextScheduledScanMs(new Date(nowMs));
    return formatCountdown(targetMs, nowMs);
  }, [nowMs]);

  return (
    <p className="site-chrome__countdown" aria-live="polite">
      <span>{isRunning ? "Next scheduled trigger" : "Next scan"}</span>
      <strong>{countdown}</strong>
      {isRunning ? (
        <em className="site-chrome__countdown-note">Skipped while current scan is running</em>
      ) : null}
    </p>
  );
}

function ManualScanTrigger({ enabled }: { enabled: boolean }) {
  const [isBusy, setIsBusy] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("Run scan now");

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/ops/scanner-status", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { running?: boolean };
        if (!isMounted) {
          return;
        }

        const running = Boolean(payload.running);
        setIsRunning(running);
        if (!isBusy) {
          setButtonLabel(running ? "Stop scan" : "Run scan now");
        }
      } catch {
        // Keep the button quiet if polling fails.
      }
    }

    void loadStatus();
    const interval = window.setInterval(loadStatus, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [enabled, isBusy]);

  if (!enabled) {
    return null;
  }

  async function handleClick() {
    setIsBusy(true);
    setButtonLabel(isRunning ? "Stopping..." : "Starting...");

    try {
      const response = await fetch(isRunning ? "/api/ops/scanner-stop" : "/api/ops/scanner-run", {
        method: "POST",
      });

      if (response.status === 409) {
        setIsRunning(true);
        setButtonLabel("Stop scan");
        return;
      }

      if (!response.ok) {
        setButtonLabel(isRunning ? "Stop failed" : "Start failed");
        return;
      }

      if (isRunning) {
        setIsRunning(false);
        setButtonLabel("Scan stopped");
        window.setTimeout(() => {
          setButtonLabel("Run scan now");
        }, 1600);
        return;
      }

      setIsRunning(true);
      setButtonLabel("Scan started");
      window.setTimeout(() => {
        setButtonLabel("Stop scan");
      }, 1600);
    } catch {
      setButtonLabel(isRunning ? "Stop failed" : "Start failed");
    } finally {
      window.setTimeout(() => {
        setIsBusy(false);
      }, 500);
    }
  }

  return (
    <button
      className={`site-chrome__scan-trigger ${isRunning ? "site-chrome__scan-trigger--danger" : ""}`}
      disabled={isBusy}
      onClick={handleClick}
      type="button"
    >
      {buttonLabel}
    </button>
  );
}

function MonthlyDiscoveryControls({ enabled }: { enabled: boolean }) {
  const [isBusy, setIsBusy] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [latestResultAt, setLatestResultAt] = useState<string | null>(null);
  const [buttonLabel, setButtonLabel] = useState("Run monthly discovery");

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/ops/pattern-discovery-status", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          running?: boolean;
          startedAt?: string | null;
          latestFinishedAt?: string | null;
        };
        if (!isMounted) {
          return;
        }

        const running = Boolean(payload.running);
        setIsRunning(running);
        setLatestResultAt(payload.latestFinishedAt ?? payload.startedAt ?? null);
        if (!isBusy) {
          setButtonLabel(running ? "Stop discovery" : "Run monthly discovery");
        }
      } catch {
        // Keep the chrome quiet if polling fails.
      }
    }

    void loadStatus();
    const interval = window.setInterval(loadStatus, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [enabled, isBusy]);

  if (!enabled) {
    return null;
  }

  async function handleClick() {
    setIsBusy(true);
    setButtonLabel(isRunning ? "Stopping..." : "Starting...");

    try {
      const response = await fetch(
        isRunning ? "/api/ops/pattern-discovery-stop" : "/api/ops/pattern-discovery-run",
        {
        method: "POST",
        },
      );

      if (response.status === 409) {
        setIsRunning(true);
        setButtonLabel("Stop discovery");
        return;
      }

      if (!response.ok) {
        setButtonLabel(isRunning ? "Stop failed" : "Start failed");
        return;
      }

      if (isRunning) {
        setIsRunning(false);
        setButtonLabel("Discovery stopped");
        window.setTimeout(() => {
          setButtonLabel("Run monthly discovery");
        }, 1600);
        return;
      }

      const nowIso = new Date().toISOString();
      setLatestResultAt(nowIso);
      setIsRunning(true);
      setButtonLabel("Discovery started");
      window.setTimeout(() => {
        setButtonLabel("Stop discovery");
      }, 1600);
    } catch {
      setButtonLabel(isRunning ? "Stop failed" : "Start failed");
    } finally {
      window.setTimeout(() => {
        setIsBusy(false);
      }, 500);
    }
  }

  return (
    <>
      <p className="site-chrome__countdown site-chrome__countdown--secondary" aria-live="polite">
        <span>Last monthly discovery</span>
        <strong>{isRunning ? "Running now" : formatHeaderTimestamp(latestResultAt)}</strong>
      </p>
      <button
        className={`site-chrome__scan-trigger site-chrome__scan-trigger--secondary ${
          isRunning ? "site-chrome__scan-trigger--danger" : ""
        }`}
        disabled={isBusy}
        onClick={handleClick}
        type="button"
      >
        {buttonLabel}
      </button>
    </>
  );
}

type PreferencesAccessModalProps = {
  onClose: () => void;
};

function PreferencesAccessModal({ onClose }: PreferencesAccessModalProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(
    "Enter your email and we will send either your sign-up email or your private preferences link.",
  );
  const [messageTone, setMessageTone] = useState<"idle" | "success" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      aria-hidden={false}
      className="site-chrome__preferences-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="preferences-access-dialog-title"
        aria-modal="true"
        className="site-chrome__preferences-modal"
        role="dialog"
      >
        <button
          aria-label="Close preferences access modal"
          className="site-chrome__preferences-modal-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>

        <div className="site-chrome__preferences-modal-layout">
          <div className="site-chrome__preferences-modal-main">
            <div className="site-chrome__preferences-modal-copy">
              <h2 id="preferences-access-dialog-title">Luxembourg flight deals, picked for you</h2>
              <p>
                Choose the kind of flight deals you want to see and how often you hear from us.
                We&apos;ll send you a private link to set it up.
              </p>
            </div>

            <form
              className="site-chrome__preferences-form"
              onSubmit={(event) => {
                event.preventDefault();

                const trimmedEmail = email.trim();
                if (!trimmedEmail) {
                  setMessageTone("error");
                  setMessage("Please enter the email you used for +352 Flights.");
                  return;
                }

                startTransition(async () => {
                  try {
                    const locale =
                      window.localStorage.getItem("luxflightdeals-locale") ??
                      document.documentElement.lang ??
                      "en";
                    const response = await fetch("/api/subscribe", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ email: trimmedEmail, locale }),
                    });

                    const payload = (await response.json()) as { message?: string; error?: string };

                    if (!response.ok) {
                      throw new Error(payload.error ?? "We could not send your email right now.");
                    }

                    setMessageTone("success");
                    setMessage(
                      payload.message ??
                        "Check your inbox and spam folder for your subscription or preferences email.",
                    );
                  } catch (error) {
                    setMessageTone("error");
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "We could not send your email right now.",
                    );
                  }
                });
              }}
            >
              <label
                className="site-chrome__preferences-field"
                htmlFor="site-chrome-preferences-email"
              >
                <span>Email address</span>
                <div className="site-chrome__preferences-input-shell">
                  <i aria-hidden="true">✉</i>
                  <input
                    autoComplete="email"
                    id="site-chrome-preferences-email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Iwantcheapflights@gmail.com"
                    type="email"
                    value={email}
                  />
                </div>
              </label>

              <div className="site-chrome__preferences-form-actions">
                <button className="site-chrome__preferences-primary" disabled={isPending} type="submit">
                  {isPending ? "Sending..." : "Email me my link"}
                </button>
                <button
                  className="site-chrome__preferences-secondary"
                  disabled={isPending}
                  type="submit"
                >
                  {isPending ? "Sending..." : "Manage my preferences"}
                </button>
              </div>
            </form>

            <p className={`site-chrome__preferences-status is-${messageTone}`}>{message}</p>
            <p className="site-chrome__preferences-footnote">
              We only use your email to send your preferences link.
            </p>
          </div>

          <aside className="site-chrome__preferences-visual" aria-hidden="true">
            <div className="site-chrome__preferences-illustration">
              <div className="site-chrome__preferences-illustration-card">
                <span>↗</span>
              </div>
              <div className="site-chrome__preferences-illustration-envelope" />
            </div>

            <div className="site-chrome__preferences-benefits">
              <div>
                <strong>Secure</strong>
                <span>No passwords</span>
              </div>
              <div>
                <strong>Instant</strong>
                <span>Get it right away</span>
              </div>
              <div>
                <strong>Personal</strong>
                <span>Only for you</span>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

export function SiteChrome() {
  const pathname = usePathname();
  const isOpsRoute = pathname.startsWith("/ops");
  const showPreferencesEntry = pathname.startsWith("/deals");
  const isDealsLanding = pathname === "/deals";
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function syncScrolledState() {
      setIsScrolled((current) => {
        const next = window.scrollY > 18;
        return current === next ? current : next;
      });
    }

    syncScrolledState();
    window.addEventListener("scroll", syncScrolledState, { passive: true });

    return () => window.removeEventListener("scroll", syncScrolledState);
  }, []);

  return (
    <>
      <div
        className={`site-chrome${isScrolled ? " is-scrolled" : ""}${isDealsLanding ? " site-chrome--deals-landing" : ""}${isOpsRoute ? " site-chrome--ops" : ""}`}
      >
        <Link className="site-chrome__brand" href="/">
          <span className="site-chrome__mark">LFD</span>
          <span className="site-chrome__wordmark">+352 Flights</span>
        </Link>
        <div className="site-chrome__center">
          {isOpsRoute ? (
            <div className="site-chrome__status-row">
              <MonthlyDiscoveryControls enabled={isOpsRoute} />
              <ManualScanTrigger enabled={isOpsRoute} />
            </div>
          ) : null}
        </div>
        <div className="site-chrome__actions">
          {showPreferencesEntry ? (
            <button
              className="site-chrome__preferences-link"
              onClick={() => setIsPreferencesModalOpen(true)}
              type="button"
            >
              My alerts
            </button>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
      {isPreferencesModalOpen ? (
        <PreferencesAccessModal onClose={() => setIsPreferencesModalOpen(false)} />
      ) : null}
    </>
  );
}
