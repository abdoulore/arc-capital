"use client";

import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { AdminButton, AdminHeader, AdminInput, AdminMetric, AdminPanel } from "@/components/admin/admin-ui";
import { useTransactionToast } from "@/store/useTransactionToast";

type Settings = {
  treasuryWallet: string;
  supportedNetworks: string[];
  defaultPenaltyBps: number;
  withdrawalWindowDays: number;
  marketplaceFeeBps: number;
  adminWallets: string[];
};

export default function AdminSettingsPage() {
  const { addToast } = useTransactionToast();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    treasuryWallet: "",
    supportedNetworks: ["Arc Testnet"],
    defaultPenaltyBps: 200,
    withdrawalWindowDays: 7,
    marketplaceFeeBps: 0,
    adminWallets: [],
  });

  useEffect(() => {
    fetch("/api/admin/settings").then((res) => res.json()).then(setSettings).catch(() => undefined);
  }, []);

  async function save() {
    const payload = {
      ...settings,
      treasuryWallet: settings.treasuryWallet.trim(),
      supportedNetworks: cleanList(settings.supportedNetworks),
      adminWallets: cleanList(settings.adminWallets).map((wallet) => wallet.toLowerCase()),
      defaultPenaltyBps: toNumber(settings.defaultPenaltyBps),
      withdrawalWindowDays: toNumber(settings.withdrawalWindowDays),
      marketplaceFeeBps: toNumber(settings.marketplaceFeeBps),
    };

    const invalidAdmins = payload.adminWallets.filter((wallet) => wallet && !isAddress(wallet));
    if (payload.treasuryWallet && !isAddress(payload.treasuryWallet)) {
      addToast({ title: "Invalid treasury wallet", message: "Enter a valid EVM address.", status: "error" });
      return;
    }
    if (invalidAdmins.length > 0) {
      addToast({ title: "Invalid admin wallet", message: invalidAdmins[0], status: "error" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Backend rejected the settings update.");
      }

      const saved = (await response.json()) as Settings;
      setSettings(saved);
      addToast({ title: "Settings saved", message: "Backend config updated.", status: "success" });
    } catch (error) {
      addToast({
        title: "Settings not saved",
        message: error instanceof Error ? error.message : "Unable to update backend config.",
        status: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <AdminHeader title="Protocol settings" description="Manage backend configuration for treasury, networks, penalties, withdrawal schedule, marketplace fees, and admin wallets." />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <AdminMetric label="Treasury wallet" value={shortAddress(settings.treasuryWallet) || "Not set"} detail="Backend configuration" />
        <AdminMetric label="Default penalty" value={`${settings.defaultPenaltyBps || 0} bps`} detail={`${((settings.defaultPenaltyBps || 0) / 100).toFixed(2)}% outside window`} />
        <AdminMetric label="Admin wallets" value={String(settings.adminWallets.length)} detail="Operator allowlist entries" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminPanel title="Treasury and risk defaults">
          <div className="grid gap-4">
            <SettingsField label="Treasury wallet" detail="Default operational wallet used by backend configuration. Contract treasury is updated separately when needed.">
              <AdminInput value={settings.treasuryWallet} onChange={(value) => setSettings({ ...settings, treasuryWallet: value.trim() })} placeholder="0x..." />
            </SettingsField>

            <div className="grid gap-4 md:grid-cols-3">
              <SettingsField label="Default penalty" detail="Basis points. 200 = 2.00%.">
                <AdminInput value={String(settings.defaultPenaltyBps)} onChange={(value) => setSettings({ ...settings, defaultPenaltyBps: toNumber(value) })} placeholder="200" />
              </SettingsField>
              <SettingsField label="Withdrawal window" detail="Number of days in the free withdrawal period.">
                <AdminInput value={String(settings.withdrawalWindowDays)} onChange={(value) => setSettings({ ...settings, withdrawalWindowDays: toNumber(value) })} placeholder="7" />
              </SettingsField>
              <SettingsField label="Marketplace fee" detail="Basis points. 0 = disabled.">
                <AdminInput value={String(settings.marketplaceFeeBps)} onChange={(value) => setSettings({ ...settings, marketplaceFeeBps: toNumber(value) })} placeholder="0" />
              </SettingsField>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel title="Access control">
          <SettingsField label="Admin wallets" detail="One wallet per line. These addresses can access protected admin routes after backend verification.">
            <textarea
              value={settings.adminWallets.join("\n")}
              onChange={(event) => setSettings({ ...settings, adminWallets: splitList(event.target.value) })}
              placeholder="0x..."
              className="min-h-36 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </SettingsField>
        </AdminPanel>

        <AdminPanel title="Supported networks">
          <SettingsField label="Networks" detail="One network label per line. Used for backend configuration and UI hints.">
            <textarea
              value={settings.supportedNetworks.join("\n")}
              onChange={(event) => setSettings({ ...settings, supportedNetworks: splitList(event.target.value) })}
              placeholder="Arc Testnet"
              className="min-h-24 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </SettingsField>
        </AdminPanel>

        <AdminPanel title="Save changes">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--muted)]">Settings are stored in backend configuration. Contract state changes still require explicit wallet transactions from the relevant admin pages.</p>
            <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
              <span className="text-xs text-[var(--muted)]">{saving ? "Saving backend configuration..." : "Ready to save changes"}</span>
              <AdminButton onClick={save} disabled={saving}>{saving ? "Saving..." : "Save settings"}</AdminButton>
            </div>
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}

function SettingsField({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{detail}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function splitList(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function cleanList(value: string[]) {
  return value.map((item) => item.trim()).filter(Boolean);
}

function toNumber(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function shortAddress(value: string) {
  if (!value) return "";
  if (value.length <= 16) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
