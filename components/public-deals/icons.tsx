"use client";

import { HERO_REFERENCE_CARDS } from "@/components/public-deals/constants";

export function SignalIcon({
  kind,
}: {
  kind: "destinations" | "checked" | "discount";
}) {
  if (kind === "destinations") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M12 21s6-4.35 6-10a6 6 0 1 0-12 0c0 5.65 6 10 6 10Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="11" fill="currentColor" r="2.2" />
      </svg>
    );
  }

  if (kind === "checked") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle
          cx="12"
          cy="12"
          fill="none"
          r="8.5"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M8.5 12.2 10.9 14.6 15.6 9.8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M18 8 13 13 10.5 10.5 6 15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M14.5 8H18v3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function LuxembourgSealIcon() {
  return (
    <svg aria-hidden="true" viewBox="35 30 910 960">
      <path
        d="M507 113.5l-5.6 18-3.8 17.2-5.1 35 1.4.9 4.8-.5 1.8.3-2.9 4.1-7.5 14.5 8.7 5 5.2 10.3 5 25.9-2.3 13.9 3.5 10.1 13.8 21 12.2 35 6.3 10.8 8.6-17 13.7 22.2 26.3 63.6 12.5 12.7 27.1 12.1 11.7 7.5 3.8 6.8 3.2 8.7 4.8 12.7.8 4.2 6.4.6 12-7.3 7.1.2 13.5 8.6 23 21.9 13.5 8.7 14 3.8 38.4 0 24.6 7.3 3.1.2 4.3 4.7-.2-.3-1.8 1.8 0 10.4-1.2.8-3.8 27-.1 8.7 2.2 5.5-.4 4.8-7.7 6.9-.6 11 1.8 10.1 3.8 8.9 5.7 7.7-6.9-2.8-3.8 1.9-2.7 6 5.5 6.3 1.5 2.7-58.7 38.2-12.4 17.4 1.4 4.1 5.1 3.5 4.9 4.8.7 8.2-2.1 5.5-6 9-8.1 16.7-20.9 25.7-12 19-4.6 13.6 0 39-1.5 11.9-5.3 39.8 2.5 37.2 0 9.1-16-1.7-21.3-11.7-38.1-28.6-1.4-1-21.9-8.8-22.7-2.4-45.9 5.1 5.2 11.3-22.6 2.1-5.7 2.3-4.2 7.5.1 7.9-1.8 6.6-9.7 3.7-7.8 11.8-11.7 4.4-68.2 4.1-13.9 4.6-11-35.2-15-15.2-50.8-12.1-20.1-9.5-13.9-13.1-25.1-33.6 19-9.1 18.3-19.6 7.6-19.3-13.5-7.4 9-8.6 6.3-12.4 10.3-28.4 6.3-7.5 8-7.4 4.4-10.7-4.4-17.6-5.8-4.9-16-1.9-5.5-4.1-2.8-9.1 1.2-4.4 2.3-3.9.5-8.1 1.2-6.8 3.9-4.4 3-5.2-.8-6.6-.3-2.8-4.6-7.4-5.2-.3-5.2 1.7-4.4-.8-4.8-2.7-11.2-3.4-5.1-4.2.3-2.8-1.7-17.3-1.3-5.8-18.8-37.4-5.3-7.9-10.2-6.2-8.5-1.5-8.1-4-8.5-14-4.9-15.6-1.1-14.8 3.5-11.9 9.5-6.4-7.6-7.1 1.4-4.5 1.5-2.9 1.1-3.7-.1-7.2 21 2.2-7.4-11.3-17.7-13.5-9.4-4.6 3.2-11.8 27.7-48.2 3.2-7.9 1.9-6.3 3-6.5 6.3-8.3 5.6-3.8 11.8-2.8 6.6-6.2 8.8-17.1-3.2-6.9-5.7-6.9.9-17.2 5-6.6 16.2-7.2 5.8-6.2 2-9.8 0-11.7-.9-14.4 4.8-7.7 11.6-10.2 4.9-7.1 2-8.5 1.5-20.2 2.9-7.9 13.3-12.1 29.7-14.7 11.9-12.4 6.4-17.9 3.3-17.1 6.8-11.6 17-1.8 12.3-9.8 5.1 5.6 2.7 11.9 4.8 9.2 7.1 3.4 3.5 1.7 9 1.3 18.2-2.9 6.9-4.3 5.2-5.6 6.2-.8 10.3 10 3.5 11.5-.9 11.8 1.8 9.8 11.9 5.4z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="42"
      />
    </svg>
  );
}

export function FooterSealHeartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path
        d="M8 13.3 2.7 8.4a3.4 3.4 0 1 1 4.8-4.8l.5.5.5-.5a3.4 3.4 0 1 1 4.8 4.8L8 13.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function HeroPlaneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m20.1 6.7-7 4-4.9-2.2L6 10l4 2.9-4 2.3v1.7l3.8-1.2 2.7 2 1.4-.8-1-2.9 7.2-5.3c.9-.7.8-1.8 0-1.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function OpportunityCalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect
        fill="none"
        height="14"
        rx="2.6"
        ry="2.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
        width="16"
        x="4"
        y="6.5"
      />
      <path
        d="M8 4.5v4M16 4.5v4M4 10.5h16"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

export function OpportunityShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 4.8 18 7v4.7c0 4-2.3 6.9-6 8.6-3.7-1.7-6-4.6-6-8.6V7l6-2.2Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="m9.6 12 1.6 1.6 3.5-3.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

export function CarouselChevronIcon({
  direction,
}: {
  direction: "previous" | "next";
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d={
          direction === "next"
            ? "M9 5.5 15.5 12 9 18.5"
            : "M15 5.5 8.5 12 15 18.5"
        }
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function HeroDestinationArt({
  city,
}: {
  city: (typeof HERO_REFERENCE_CARDS)[number]["city"];
}) {
  if (city === "Rome") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 360 210"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="hero-rome-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a2440" />
            <stop offset="58%" stopColor="#233252" />
            <stop offset="100%" stopColor="#0f1627" />
          </linearGradient>
        </defs>
        <rect width="360" height="210" fill="url(#hero-rome-sky)" />
        <circle cx="296" cy="40" r="46" fill="rgba(240, 180, 96, 0.14)" />
        <path
          d="M0 150C54 132 108 126 176 132C236 138 292 152 360 186V210H0Z"
          fill="rgba(7, 12, 24, 0.56)"
        />
        <path
          d="M228 72h80v58h-80zM238 84h60M238 96h60M240 108h56M240 120h56M240 130h56"
          fill="none"
          stroke="rgba(246, 236, 214, 0.9)"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M242 132c8-11 16-16 24-16s16 5 24 16M266 132c7-10 14-15 21-15s14 5 21 15"
          fill="none"
          stroke="rgba(246, 236, 214, 0.8)"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <path
          d="M196 138h136"
          stroke="rgba(240, 180, 96, 0.42)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (city === "Lisbon") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 360 210"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="hero-lisbon-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#20304d" />
            <stop offset="52%" stopColor="#465d84" />
            <stop offset="100%" stopColor="#132038" />
          </linearGradient>
          <linearGradient id="hero-lisbon-water" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1c3358" />
            <stop offset="100%" stopColor="#2b5f84" />
          </linearGradient>
        </defs>
        <rect width="360" height="210" fill="url(#hero-lisbon-sky)" />
        <circle cx="306" cy="40" r="40" fill="rgba(255, 221, 166, 0.12)" />
        <path
          d="M0 140C44 128 96 122 146 126C206 130 288 150 360 170V210H0Z"
          fill="url(#hero-lisbon-water)"
        />
        <path
          d="M194 150h88v-16h-12v-34h-8v-20h-12v-14h-14v14h-10v20h-8v34h-24Z"
          fill="rgba(238, 230, 214, 0.9)"
        />
        <path
          d="M184 154h116"
          stroke="rgba(243, 179, 88, 0.42)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M160 126c24-18 42-32 56-42"
          fill="none"
          stroke="rgba(255, 203, 120, 0.24)"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 210"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="hero-budapest-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#182745" />
          <stop offset="56%" stopColor="#2d4770" />
          <stop offset="100%" stopColor="#0d172a" />
        </linearGradient>
      </defs>
      <rect width="360" height="210" fill="url(#hero-budapest-sky)" />
      <circle cx="304" cy="38" r="42" fill="rgba(255, 205, 132, 0.12)" />
      <path
        d="M0 156c50-20 104-28 164-24c70 4 126 26 196 56v22H0Z"
        fill="rgba(9, 16, 28, 0.52)"
      />
      <path
        d="M196 148h94v-12h-6v-46h-10v-16h-8v16h-8v-24h-14v24h-10v58h-12v-40h-12v40h-14Z"
        fill="rgba(240, 232, 216, 0.92)"
      />
      <path
        d="M180 152h124"
        stroke="rgba(243, 179, 88, 0.42)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M170 158h126l-12 18H182Z" fill="rgba(14, 24, 40, 0.48)" />
    </svg>
  );
}
