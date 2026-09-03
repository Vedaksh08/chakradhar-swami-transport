"use client";

import { useEffect, useState } from "react";
import { Check, Download, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — there is no display-mode match there.
    (navigator as any).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

/** Registers the offline shell service worker. Renders nothing. */
export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability just degrades to "no offline shell" — nothing to
      // show the user for a failed background registration.
    });
  }, []);
  return null;
}

/** "Add to home screen" control for the Settings page. */
export function InstallAppButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // The prompt is single-use either way — a fresh one arrives later if the
    // browser decides to offer it again.
    setPrompt(null);
    if (outcome === "accepted") setInstalled(true);
  }

  if (installed) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <Check size={18} className="shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-bold text-navy-900">App installed</p>
          <p className="mt-0.5 text-xs text-navy-500">
            Already running as an app on this device.
          </p>
        </div>
      </div>
    );
  }

  if (prompt) {
    return (
      <button onClick={install} className="btn-primary w-full">
        <Download size={16} /> Add to home screen
      </button>
    );
  }

  if (ios) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-navy-200 bg-navy-50/60 p-3">
        <Share size={18} className="mt-0.5 shrink-0 text-navy-600" />
        <p className="text-xs text-navy-600">
          Open this site in Safari, tap <strong>Share</strong>, then{" "}
          <strong>Add to Home Screen</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-navy-200 bg-navy-50/60 p-3">
      <p className="text-xs text-navy-500">
        Your browser will offer to install the app once it decides the page qualifies — or
        use its menu and look for <strong>Add to Home Screen</strong> /{" "}
        <strong>Install app</strong>.
      </p>
    </div>
  );
}
