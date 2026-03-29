"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  bucketOptionMap,
  bucketValues,
  defaultPreferenceValues,
  deliveryModeOptions,
  maxStopsPreferenceOptions,
  routePreferenceGroups,
  routePreferenceMap,
  type BucketValue,
  type PreferencesBundle,
} from "@/lib/preferences-shared";

type ScreenState =
  | {
      phase: "idle";
      message: string;
    }
  | {
      phase: "success";
      message: string;
    }
  | {
      phase: "error";
      message: string;
    };

type PreferenceFormState = PreferencesBundle["form"];

const initialScreenState: ScreenState = {
  phase: "idle",
  message: "Choose the routes and travel shapes that are actually useful to you.",
};

function toNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function PreferencesManager() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [bundle, setBundle] = useState<PreferencesBundle | null>(null);
  const [form, setForm] = useState<PreferenceFormState>(defaultPreferenceValues);
  const [screen, setScreen] = useState<ScreenState>(initialScreenState);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let isActive = true;

    async function loadPreferences() {
      if (!token) {
        setIsLoading(false);
        setScreen({
          phase: "error",
          message: "This page needs a valid preference link from the signup flow.",
        });
        return;
      }

      setIsLoading(true);
      setScreen(initialScreenState);

      try {
        const response = await fetch(`/api/preferences?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as PreferencesBundle & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "We could not load your preferences.");
        }

        if (!isActive) {
          return;
        }

        setBundle(payload);
        setForm(payload.form);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setScreen({
          phase: "error",
          message:
            error instanceof Error
              ? error.message
              : "We could not load your preferences.",
        });
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPreferences();

    return () => {
      isActive = false;
    };
  }, [token]);

  const groupedRoutes = useMemo(
    () =>
      routePreferenceGroups.map((group) => ({
        ...group,
        isEnabled: form.preferredBuckets.includes(group.bucket),
      })),
    [form.preferredBuckets],
  );

  if (isLoading) {
    return (
      <section className="preferences-panel">
        <div className="preferences-loading">
          <p>Loading your route profile...</p>
        </div>
      </section>
    );
  }

  if (!token || !bundle) {
    return (
      <section className="preferences-panel">
        <div className="preferences-empty">
          <p className="preferences-status preferences-status--error">{screen.message}</p>
          <a className="preferences-link" href="/">
            Go back to the homepage
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="preferences-panel">
      <div className="preferences-panel__header">
        <div>
          <p className="preferences-step">
            Step 2 of 2 · Preferences for {bundle.email}
          </p>
          <h1>Tell us which fare drops are worth emailing you.</h1>
          <p>
            Start broad and we can narrow later. Your default airport is{" "}
            <strong>{bundle.homeAirport}</strong>, and you can come back to this link to edit the
            profile anytime.
          </p>
        </div>
        <div className="preferences-summary">
          <span>{bundle.onboardingCompleted ? "Profile active" : "Profile incomplete"}</span>
          <strong>{form.selectedRoutes.length} routes selected</strong>
        </div>
      </div>

      <form
        className="preferences-form"
        onSubmit={(event) => {
          event.preventDefault();

          if (form.preferredBuckets.length === 0) {
            setScreen({
              phase: "error",
              message: "Pick at least one route bucket.",
            });
            return;
          }

          if (form.selectedRoutes.length === 0) {
            setScreen({
              phase: "error",
              message: "Pick at least one destination route.",
            });
            return;
          }

          startTransition(async () => {
            setScreen({
              phase: "idle",
              message: "Saving your route profile...",
            });

            try {
              const response = await fetch("/api/preferences", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  token: bundle.token,
                  ...form,
                }),
              });

              const payload = (await response.json()) as { message?: string; error?: string };
              if (!response.ok) {
                throw new Error(payload.error ?? "We could not save your preferences.");
              }

              setScreen({
                phase: "success",
                message:
                  payload.message ?? "Preferences saved. Your Luxembourg profile is live.",
              });
            } catch (error) {
              setScreen({
                phase: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "We could not save your preferences.",
              });
            }
          });
        }}
      >
        <section className="preferences-section">
          <div className="preferences-section__intro">
            <p className="preferences-label">Travel styles</p>
            <h2>Which kinds of trips do you want us to prioritize?</h2>
          </div>
          <div className="preferences-chip-grid">
            {bucketValues.map((bucket) => {
              const option = bucketOptionMap[bucket];
              const checked = form.preferredBuckets.includes(bucket);

              return (
                <label className={`preferences-chip ${checked ? "is-active" : ""}`} key={bucket}>
                  <input
                    checked={checked}
                    name="preferredBuckets"
                    onChange={(event) => {
                      setForm((current) => {
                        const preferredBuckets = event.target.checked
                          ? [...current.preferredBuckets, bucket].filter(
                              (value, index, values) => values.indexOf(value) === index,
                            )
                          : current.preferredBuckets.filter((value) => value !== bucket);

                        const selectedRoutes = event.target.checked
                          ? current.selectedRoutes
                          : current.selectedRoutes.filter((routeKey) => {
                              const route = routePreferenceMap.get(routeKey);
                              return route?.bucket !== bucket;
                            });

                        return {
                          ...current,
                          preferredBuckets,
                          selectedRoutes,
                        };
                      });
                    }}
                    type="checkbox"
                    value={bucket}
                  />
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </label>
              );
            })}
          </div>
        </section>

        <section className="preferences-section">
          <div className="preferences-section__intro">
            <p className="preferences-label">Destination watchlist</p>
            <h2>Pick the routes you actually want in your inbox.</h2>
          </div>
          <div className="preferences-route-groups">
            {groupedRoutes.map((group) => (
              <article
                className={`preferences-route-group ${group.isEnabled ? "" : "is-muted"}`}
                key={group.bucket}
              >
                <header>
                  <p className="preferences-route-group__eyebrow">{group.label}</p>
                  <h3>{group.description}</h3>
                </header>
                <div className="preferences-route-grid">
                  {group.routes.map((route) => {
                    const checked = form.selectedRoutes.includes(route.key);

                    return (
                      <label
                        className={`preferences-route-card ${checked ? "is-selected" : ""}`}
                        key={route.key}
                      >
                        <input
                          checked={checked}
                          disabled={!group.isEnabled}
                          onChange={(event) => {
                            setForm((current) => {
                              const routeKeys = event.target.checked
                                ? [...current.selectedRoutes, route.key].filter(
                                    (value, index, values) => values.indexOf(value) === index,
                                  )
                                : current.selectedRoutes.filter((value) => value !== route.key);

                              const preferredBuckets = event.target.checked
                                ? [...current.preferredBuckets, route.bucket].filter(
                                    (value, index, values) => values.indexOf(value) === index,
                                  ) as BucketValue[]
                                : current.preferredBuckets;

                              return {
                                ...current,
                                preferredBuckets,
                                selectedRoutes: routeKeys,
                              };
                            });
                          }}
                          type="checkbox"
                          value={route.key}
                        />
                        <span>
                          {route.destinationCity} <strong>{route.destinationAirport}</strong>
                        </span>
                        <small>
                          Scanner range: {route.stayLabel}. {route.teaser}
                        </small>
                      </label>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="preferences-section preferences-section--controls">
          <div className="preferences-control-block">
            <div className="preferences-section__intro">
              <p className="preferences-label">Routing</p>
              <h2>How strict should we be on stops?</h2>
            </div>
            <div className="preferences-choice-grid">
              {maxStopsPreferenceOptions.map((option) => (
                <label
                  className={`preferences-choice ${
                    form.maxStopsPreference === option.value ? "is-selected" : ""
                  }`}
                  key={option.value}
                >
                  <input
                    checked={form.maxStopsPreference === option.value}
                    name="maxStopsPreference"
                    onChange={() =>
                      setForm((current) => ({
                        ...current,
                        maxStopsPreference: option.value,
                      }))
                    }
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </label>
              ))}
            </div>
          </div>

          <div className="preferences-control-block">
            <div className="preferences-section__intro">
              <p className="preferences-label">Delivery</p>
              <h2>How often should we write to you?</h2>
            </div>
            <div className="preferences-choice-grid">
              {deliveryModeOptions.map((option) => (
                <label
                  className={`preferences-choice ${
                    form.deliveryMode === option.value ? "is-selected" : ""
                  }`}
                  key={option.value}
                >
                  <input
                    checked={form.deliveryMode === option.value}
                    name="deliveryMode"
                    onChange={() =>
                      setForm((current) => ({
                        ...current,
                        deliveryMode: option.value,
                      }))
                    }
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </label>
              ))}
            </div>
          </div>

          <div className="preferences-fields">
            <label className="preferences-field">
              <span>Minimum nights</span>
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    minTripNights: toNumberOrNull(event.target.value),
                  }))
                }
                placeholder="1"
                type="number"
                value={form.minTripNights ?? ""}
              />
            </label>
            <label className="preferences-field">
              <span>Maximum nights</span>
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxTripNights: toNumberOrNull(event.target.value),
                  }))
                }
                placeholder="7"
                type="number"
                value={form.maxTripNights ?? ""}
              />
            </label>
            <label className="preferences-field">
              <span>Budget ceiling (EUR)</span>
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    budgetCeilingEur: toNumberOrNull(event.target.value),
                  }))
                }
                placeholder="250"
                type="number"
                value={form.budgetCeilingEur ?? ""}
              />
            </label>
          </div>
        </section>

        <div className="preferences-footer">
          <p className={`preferences-status preferences-status--${screen.phase}`}>
            {screen.message}
          </p>
          <button className="preferences-submit" disabled={isPending} type="submit">
            {isPending ? "Saving..." : "Save my preferences"}
          </button>
        </div>
      </form>
    </section>
  );
}
