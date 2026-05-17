import { useState, useEffect, useRef } from "react";
import { C } from "../theme.js";
import { useT } from "../lib/i18n.js";

export const APP_VERSION = "v1.0.0";

const ROLE_LABEL_KEYS = {
  admin: "settings.role.admin",
  super_admin: "settings.role.super_admin",
  hrbp: "settings.role.hrbp",
};

function MenuItem({ icon, label, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        background: hover ? C.surfLL : "transparent",
        border: "none",
        borderRadius: 6,
        padding: "9px 12px",
        cursor: "pointer",
        textAlign: "left",
        color: C.text,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "'DM Sans',sans-serif",
        transition: "background .12s",
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, width: 18, textAlign: "center" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange?.(opt.value)}
            style={{
              flex: 1,
              padding: "5px 10px",
              background: active ? C.em + "22" : C.surfLL,
              border: `1px solid ${active ? C.em + "66" : C.border}`,
              borderRadius: 6,
              color: active ? C.em : C.textM,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif",
              transition: "all .12s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionRow({ icon, label, children }) {
  return (
    <div style={{ padding: "8px 12px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        color: C.textM,
        marginBottom: 6,
        fontWeight: 600,
        letterSpacing: 0.2,
      }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SettingsDropdown({
  open,
  onClose,
  anchorRef,
  userProfile,
  onNavigateAdmin,
  onSignOut,
}) {
  const { t, lang, setLang } = useT();
  const [theme, setTheme] = useState("dark");
  const [currency, setCurrency] = useState("CAD");
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    const escHandler = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const roleKey = userProfile?.role && ROLE_LABEL_KEYS[userProfile.role];
  const roleLabel = roleKey ? t(roleKey) : t("settings.role.admin");
  const email = userProfile?.email || "";

  const goAdmin = () => { onClose?.(); onNavigateAdmin?.(); };

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 320,
        background: C.surf,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,.45)",
        padding: 8,
        zIndex: 1000,
        fontFamily: "'DM Sans',sans-serif",
      }}
    >
      {/* Profile header */}
      <div style={{
        padding: "10px 12px 12px",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 6,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
          Samuel Chartrand
        </div>
        <div style={{
          fontSize: 11,
          color: C.textM,
          marginTop: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {email}
        </div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.amber,
            background: C.amber + "22",
            border: `1px solid ${C.amber}55`,
            borderRadius: 4,
            padding: "2px 6px",
            letterSpacing: 0.3,
          }}>
            {roleLabel}
          </span>
        </div>
      </div>

      {/* Menu items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <MenuItem icon="⚙️" label={t("settings.item.settings")}    onClick={goAdmin} />
        <MenuItem icon="👥" label={t("settings.item.users")}       onClick={goAdmin} />
        <MenuItem icon="🔐" label={t("settings.item.permissions")} onClick={goAdmin} />
      </div>

      <div style={{ height: 1, background: C.border, margin: "6px 4px" }} />

      <SectionRow icon="🌐" label={t("settings.section.language")}>
        <ToggleGroup
          value={lang}
          onChange={setLang}
          options={[{ value: "en", label: "EN" }, { value: "fr", label: "FR" }]}
        />
      </SectionRow>

      <SectionRow icon="🎨" label={t("settings.section.theme")}>
        <ToggleGroup
          value={theme}
          onChange={setTheme}
          options={[
            { value: "dark",  label: t("settings.theme.dark") },
            { value: "light", label: t("settings.theme.light") },
          ]}
        />
      </SectionRow>

      <SectionRow icon="💰" label={t("settings.section.currency")}>
        <ToggleGroup
          value={currency}
          onChange={setCurrency}
          options={[{ value: "CAD", label: "CAD" }, { value: "USD", label: "USD" }]}
        />
      </SectionRow>

      <SectionRow icon="🕒" label={t("settings.section.timezone")}>
        <div style={{
          padding: "6px 10px",
          background: C.surfLL,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          fontSize: 11,
          color: C.textM,
          fontWeight: 500,
        }}>
          America/Toronto
        </div>
      </SectionRow>

      {/* Footer */}
      <div style={{ height: 1, background: C.border, margin: "6px 4px" }} />
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 12px 4px",
      }}>
        <span style={{ fontSize: 10, color: C.textD, fontFamily: "'DM Mono',monospace" }}>
          {t("settings.version")}: {APP_VERSION}
        </span>
      </div>
      <MenuItem
        icon="🚪"
        label={t("settings.logout")}
        onClick={async () => { onClose?.(); await onSignOut?.(); }}
      />
    </div>
  );
}
