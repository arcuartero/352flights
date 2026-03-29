"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  bucketOptionMap,
  bucketValues,
  destinationCityOptions,
  defaultPreferenceValues,
  deliveryModeOptions,
  deriveSelectedRoutesFromBuckets,
  maxStopsPreferenceOptions,
  weekdayOptions,
  type BucketValue,
  type CustomAlertRuleValue,
  type DeliveryModeValue,
  type MaxStopsPreferenceValue,
  type PreferencesBundle,
  type WeekdayValue,
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
  message:
    "Pick the trip styles, routing types, and email cadences you want. You can mix several options in each section.",
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

function toggleSelection<T extends string>(values: T[], value: T, checked: boolean) {
  if (checked) {
    return [...values, value].filter((entry, index, items) => items.indexOf(entry) === index);
  }

  return values.filter((entry) => entry !== value);
}

function makeClientRuleId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyCustomRule(): CustomAlertRuleValue {
  return {
    id: makeClientRuleId(),
    name: "New custom watch",
    destinationCity: null,
    bucket: null,
    maxStopsPreferences: ["ONE_STOP_OR_FEWER"],
    budgetCeilingEur: null,
    departureWeekdays: ["FRI", "SAT"],
    minTripNights: null,
    maxTripNights: null,
    isActive: true,
  };
}

function buildSimpleFormState(bundle: PreferencesBundle): PreferenceFormState {
  return {
    preferredBuckets: bundle.form.preferredBuckets,
    selectedRoutes: deriveSelectedRoutesFromBuckets(bundle.form.preferredBuckets),
    maxStopsPreferences: bundle.form.maxStopsPreferences,
    departureWeekdays: bundle.form.departureWeekdays,
    minTripNights: null,
    maxTripNights: null,
    budgetCeilingEur: bundle.form.budgetCeilingEur,
    deliveryModes: bundle.form.deliveryModes,
    customAlertRules: bundle.form.customAlertRules,
  };
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
        setForm(buildSimpleFormState(payload));
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

  if (isLoading) {
    return (
      <section className="preferences-panel">
        <div className="preferences-loading">
          <p>Loading your subscription profile...</p>
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

  const selectedTripStyles = form.preferredBuckets.length;
  const customRuleCount = form.customAlertRules.length;

  return (
    <section className="preferences-panel">
      <div className="preferences-panel__header">
        <div>
          <p className="preferences-step">Manage alerts for {bundle.email}</p>
          <h1>Shape the Luxembourg deals you actually want to receive.</h1>
          <p>
            Keep the feed broad or narrow it down. Your base airport stays{" "}
            <strong>{bundle.homeAirport}</strong>, and you can come back to this link anytime.
          </p>
        </div>
        <div className="preferences-summary">
          <span>{bundle.emailConfirmed ? "Confirmed" : "Pending confirmation"}</span>
          <strong>
            {selectedTripStyles} travel styles · {customRuleCount} custom watches
          </strong>
        </div>
      </div>

      <section className="preferences-overview-bento">
        <article className="preferences-overview-card preferences-overview-card--summary">
          <p className="preferences-label">Current setup</p>
          <h2>Your alert profile in one glance</h2>
          <p>
            Keep the broad feed tidy, then sharpen it with timing, routing, budget, and custom
            watches for the patterns you care about most.
          </p>
        </article>

        <article className="preferences-overview-card">
          <span>Trip styles</span>
          <strong>{selectedTripStyles}</strong>
          <small>City breaks, beach escapes, and long-haul buckets can all coexist.</small>
        </article>

        <article className="preferences-overview-card">
          <span>Custom watches</span>
          <strong>{customRuleCount}</strong>
          <small>Each watch can target city, stops, weekdays, nights, and budget.</small>
        </article>

        <article className="preferences-overview-card preferences-overview-card--wide">
          <span>How this page works</span>
          <strong>General feed first, precise watches second</strong>
          <small>
            Use the top controls for the overall stream, then add compact bento-style rules below
            whenever you want a tighter pattern.
          </small>
        </article>
      </section>

      {!bundle.emailConfirmed ? (
        <section className="preferences-inline-note">
          <p>
            Your preferences can be saved now, but alerts only go live after you confirm the email
            in your welcome message.
          </p>
        </section>
      ) : null}

      <form
        className="preferences-form preferences-form--bento"
        onSubmit={(event) => {
          event.preventDefault();

          if (form.preferredBuckets.length === 0) {
            setScreen({
              phase: "error",
              message: "Pick at least one travel style.",
            });
            return;
          }

          if (form.maxStopsPreferences.length === 0) {
            setScreen({
              phase: "error",
              message: "Pick at least one routing option.",
            });
            return;
          }

          if (form.deliveryModes.length === 0) {
            setScreen({
              phase: "error",
              message: "Pick at least one email cadence.",
            });
            return;
          }

          if (form.departureWeekdays.length === 0) {
            setScreen({
              phase: "error",
              message: "Pick at least one departure weekday.",
            });
            return;
          }

          const invalidCustomRule = form.customAlertRules.find((rule) => {
            if (!rule.name.trim()) {
              return true;
            }

            if (rule.maxStopsPreferences.length === 0 || rule.departureWeekdays.length === 0) {
              return true;
            }

            if (
              rule.minTripNights !== null &&
              rule.maxTripNights !== null &&
              rule.minTripNights > rule.maxTripNights
            ) {
              return true;
            }

            return false;
          });

          if (invalidCustomRule) {
            setScreen({
              phase: "error",
              message:
                "Each custom watch needs a name, at least one stops option, at least one departure weekday, and a valid night range.",
            });
            return;
          }

          startTransition(async () => {
            setScreen({
              phase: "idle",
              message: "Saving your alert profile...",
            });

            try {
              const response = await fetch("/api/preferences", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  token: bundle.token,
                  preferredBuckets: form.preferredBuckets,
                  selectedRoutes: deriveSelectedRoutesFromBuckets(form.preferredBuckets),
                  maxStopsPreferences: form.maxStopsPreferences,
                  departureWeekdays: form.departureWeekdays,
                  minTripNights: null,
                  maxTripNights: null,
                  budgetCeilingEur: form.budgetCeilingEur,
                  deliveryModes: form.deliveryModes,
                  customAlertRules: form.customAlertRules,
                }),
              });

              const payload = (await response.json()) as { message?: string; error?: string };
              if (!response.ok) {
                throw new Error(payload.error ?? "We could not save your preferences.");
              }

              setScreen({
                phase: "success",
                message:
                  payload.message ?? "Preferences saved. Your Luxembourg profile is ready.",
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
            <h2>What kinds of trips should we prioritize?</h2>
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

                        return {
                          ...current,
                          preferredBuckets,
                          selectedRoutes: deriveSelectedRoutesFromBuckets(preferredBuckets),
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

        <section className="preferences-section preferences-section--controls">
          <div className="preferences-control-block">
            <div className="preferences-section__intro">
              <p className="preferences-label">Travel timing</p>
              <h2>Which departure weekdays fit your life best?</h2>
            </div>
            <div className="preferences-weekday-grid">
              {weekdayOptions.map((option) => {
                const checked = form.departureWeekdays.includes(option.value);

                return (
                  <label
                    className={`preferences-weekday ${checked ? "is-selected" : ""}`}
                    key={option.value}
                  >
                    <input
                      checked={checked}
                      name="departureWeekdays"
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          departureWeekdays: toggleSelection(
                            current.departureWeekdays,
                            option.value,
                            event.target.checked,
                          ),
                        }));
                      }}
                      type="checkbox"
                      value={option.value}
                    />
                    <span>{option.shortLabel}</span>
                    <small>{option.label}</small>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="preferences-control-block">
            <div className="preferences-section__intro">
              <p className="preferences-label">Routing</p>
              <h2>Pick every routing shape you are happy to receive</h2>
            </div>
            <div className="preferences-choice-grid">
              {maxStopsPreferenceOptions.map((option) => {
                const checked = form.maxStopsPreferences.includes(option.value);

                return (
                  <label
                    className={`preferences-choice ${checked ? "is-selected" : ""}`}
                    key={option.value}
                  >
                    <input
                      checked={checked}
                      name="maxStopsPreferences"
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          maxStopsPreferences: toggleSelection(
                            current.maxStopsPreferences,
                            option.value,
                            event.target.checked,
                          ),
                        }));
                      }}
                      type="checkbox"
                      value={option.value}
                    />
                    <span>{option.label}</span>
                    <small>{option.description}</small>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="preferences-control-block">
            <div className="preferences-section__intro">
              <p className="preferences-label">Budget</p>
              <h2>Optional ceiling for fare alerts</h2>
            </div>
            <div className="preferences-fields preferences-fields--dual">
              <label className="preferences-field">
                <span>Maximum price in EUR</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      budgetCeilingEur: toNumberOrNull(event.target.value),
                    }));
                  }}
                  placeholder="Leave blank for any price"
                  type="text"
                  value={form.budgetCeilingEur ?? ""}
                />
              </label>
            </div>
          </div>

          <div className="preferences-control-block">
            <div className="preferences-section__intro">
              <p className="preferences-label">Cadence</p>
              <h2>Pick every email rhythm you want from us</h2>
            </div>
            <div className="preferences-choice-grid">
              {deliveryModeOptions.map((option) => {
                const checked = form.deliveryModes.includes(option.value);

                return (
                  <label
                    className={`preferences-choice ${checked ? "is-selected" : ""}`}
                    key={option.value}
                  >
                    <input
                      checked={checked}
                      name="deliveryModes"
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          deliveryModes: toggleSelection(
                            current.deliveryModes,
                            option.value,
                            event.target.checked,
                          ),
                        }));
                      }}
                      type="checkbox"
                      value={option.value}
                    />
                    <span>{option.label}</span>
                    <small>{option.description}</small>
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section className="preferences-section">
          <div className="preferences-section__intro">
            <p className="preferences-label">Custom watches</p>
            <h2>Create precise mini-crons for the trips you care about most</h2>
            <p className="preferences-subcopy">
              These act like personal monitors on top of your general profile. A deal can match by
              city, category, nights, price, stops, and departure weekdays.
            </p>
          </div>

          <div className="preferences-custom-rules">
            {form.customAlertRules.length === 0 ? (
              <div className="preferences-empty preferences-empty--stacked">
                <p>No custom watches yet. Add one for patterns like “Friday city breaks under €140”.</p>
              </div>
            ) : null}

            {form.customAlertRules.map((rule, ruleIndex) => (
              <article className="preferences-rule-card" key={rule.id}>
                <div className="preferences-rule-card__header">
                  <div>
                    <p className="preferences-label">Watch {ruleIndex + 1}</p>
                    <h3>{rule.name}</h3>
                  </div>
                  <div className="preferences-link-row">
                    <label className="preferences-toggle">
                      <input
                        checked={rule.isActive}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            customAlertRules: current.customAlertRules.map((item) =>
                              item.id === rule.id
                                ? {
                                    ...item,
                                    isActive: event.target.checked,
                                  }
                                : item,
                            ),
                          }));
                        }}
                        type="checkbox"
                      />
                      <span>{rule.isActive ? "Active" : "Paused"}</span>
                    </label>
                    <button
                      className="preferences-inline-button"
                      onClick={() => {
                        setForm((current) => ({
                          ...current,
                          customAlertRules: current.customAlertRules.filter(
                            (item) => item.id !== rule.id,
                          ),
                        }));
                      }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="preferences-rule-grid">
                  <label className="preferences-field">
                    <span>Name</span>
                    <input
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          customAlertRules: current.customAlertRules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  name: event.target.value,
                                }
                              : item,
                          ),
                        }));
                      }}
                      placeholder="Weekend city break"
                      type="text"
                      value={rule.name}
                    />
                  </label>

                  <label className="preferences-field">
                    <span>Destination city</span>
                    <select
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          customAlertRules: current.customAlertRules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  destinationCity: event.target.value || null,
                                }
                              : item,
                          ),
                        }));
                      }}
                      value={rule.destinationCity ?? ""}
                    >
                      <option value="">Any city</option>
                      {destinationCityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="preferences-field">
                    <span>Destination category</span>
                    <select
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          customAlertRules: current.customAlertRules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  bucket: (event.target.value || null) as BucketValue | null,
                                }
                              : item,
                          ),
                        }));
                      }}
                      value={rule.bucket ?? ""}
                    >
                      <option value="">Any category</option>
                      {bucketValues.map((bucket) => (
                        <option key={bucket} value={bucket}>
                          {bucketOptionMap[bucket].label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="preferences-field">
                    <span>Max price in EUR</span>
                    <input
                      inputMode="numeric"
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          customAlertRules: current.customAlertRules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  budgetCeilingEur: toNumberOrNull(event.target.value),
                                }
                              : item,
                          ),
                        }));
                      }}
                      placeholder="Leave blank for any price"
                      type="text"
                      value={rule.budgetCeilingEur ?? ""}
                    />
                  </label>

                  <label className="preferences-field">
                    <span>Min nights</span>
                    <input
                      inputMode="numeric"
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          customAlertRules: current.customAlertRules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  minTripNights: toNumberOrNull(event.target.value),
                                }
                              : item,
                          ),
                        }));
                      }}
                      placeholder="Any"
                      type="text"
                      value={rule.minTripNights ?? ""}
                    />
                  </label>

                  <label className="preferences-field">
                    <span>Max nights</span>
                    <input
                      inputMode="numeric"
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          customAlertRules: current.customAlertRules.map((item) =>
                            item.id === rule.id
                              ? {
                                  ...item,
                                  maxTripNights: toNumberOrNull(event.target.value),
                                }
                              : item,
                          ),
                        }));
                      }}
                      placeholder="Any"
                      type="text"
                      value={rule.maxTripNights ?? ""}
                    />
                  </label>
                </div>

                <div className="preferences-rule-block">
                  <div className="preferences-section__intro">
                    <p className="preferences-label">Stops</p>
                  </div>
                  <div className="preferences-choice-grid">
                    {maxStopsPreferenceOptions.map((option) => {
                      const checked = rule.maxStopsPreferences.includes(option.value);

                      return (
                        <label
                          className={`preferences-choice ${checked ? "is-selected" : ""}`}
                          key={`${rule.id}-${option.value}`}
                        >
                          <input
                            checked={checked}
                            onChange={(event) => {
                              setForm((current) => ({
                                ...current,
                                customAlertRules: current.customAlertRules.map((item) =>
                                  item.id === rule.id
                                    ? {
                                        ...item,
                                        maxStopsPreferences: toggleSelection(
                                          item.maxStopsPreferences,
                                          option.value,
                                          event.target.checked,
                                        ) as MaxStopsPreferenceValue[],
                                      }
                                    : item,
                                ),
                              }));
                            }}
                            type="checkbox"
                            value={option.value}
                          />
                          <span>{option.label}</span>
                          <small>{option.description}</small>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="preferences-rule-block">
                  <div className="preferences-section__intro">
                    <p className="preferences-label">Departure weekdays</p>
                  </div>
                  <div className="preferences-weekday-grid">
                    {weekdayOptions.map((option) => {
                      const checked = rule.departureWeekdays.includes(option.value);

                      return (
                        <label
                          className={`preferences-weekday ${checked ? "is-selected" : ""}`}
                          key={`${rule.id}-${option.value}-weekday`}
                        >
                          <input
                            checked={checked}
                            onChange={(event) => {
                              setForm((current) => ({
                                ...current,
                                customAlertRules: current.customAlertRules.map((item) =>
                                  item.id === rule.id
                                    ? {
                                        ...item,
                                        departureWeekdays: toggleSelection(
                                          item.departureWeekdays,
                                          option.value,
                                          event.target.checked,
                                        ) as WeekdayValue[],
                                      }
                                    : item,
                                ),
                              }));
                            }}
                            type="checkbox"
                            value={option.value}
                          />
                          <span>{option.shortLabel}</span>
                          <small>{option.label}</small>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="preferences-link-row">
            <button
              className="preferences-inline-button"
              onClick={() => {
                setForm((current) => ({
                  ...current,
                  customAlertRules: [...current.customAlertRules, createEmptyCustomRule()],
                }));
              }}
              type="button"
            >
              Add custom watch
            </button>
          </div>
        </section>

        <section className="preferences-section preferences-section--support">
          <div className="preferences-section__intro">
            <p className="preferences-label">Account links</p>
            <h2>Edit later or stop emails completely</h2>
          </div>
          <div className="preferences-link-row">
            <a className="preferences-link preferences-link--ghost" href={bundle.unsubscribePath}>
              Unsubscribe from all emails
            </a>
          </div>
        </section>

        <div className="preferences-footer">
          <p className={`preferences-status preferences-status--${screen.phase}`}>
            {screen.message}
          </p>
          <button className="preferences-submit" disabled={isPending} type="submit">
            {isPending ? "Saving..." : "Save preferences"}
          </button>
        </div>
      </form>
    </section>
  );
}
