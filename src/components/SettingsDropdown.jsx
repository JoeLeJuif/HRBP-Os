import { useState, useEffect, useRef } from "react";
import { C } from "../theme.js";
import { useT } from "../lib/i18n.js";
import ProvinceSelect from "./ProvinceSelect.jsx";

export const APP_VERSION = "v1.0.0";

const ROLE_LABEL_KEYS = {
  admin: "settings.role.admin",
  super_admin: "settings.role.super_admin",
  hrbp: "settings.role.hrbp",
};

function MenuItem({ icon, label, onClick, disabled = false, hint }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-disabled={disabled || undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        background: disabled ? "transparent" : (hover ? C.surfLL : "transparent"),
        border: "none",
        borderRadius: 6,
        padding: "9px 12px",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        color: disabled ? C.textD : C.text,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "'DM Sans',sans-serif",
        transition: "background .12s",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, width: 18, textAlign: "center" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {hint && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: C.textD,
          background: C.surfLL,
          border: `1px solid ${C.border}`,
          borderRadius: 4,
          padding: "2px 5px",
        }}>{hint}</span>
      )}
    </button>
  );
}

function ToggleGroup({ options, value, onChange, disabled = false }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={disabled ? undefined : () => onChange?.(opt.value)}
            aria-disabled={disabled || undefined}
            style={{
              flex: 1,
              padding: "5px 10px",
              background: active ? C.em + "22" : C.surfLL,
              border: `1px solid ${active ? C.em + "66" : C.border}`,
              borderRadius: 6,
              color: active ? C.em : C.textM,
              fontSize: 11,
              fontWeight: 600,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans',sans-serif",
              transition: "all .12s",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionRow({ icon, label, hint, children }) {
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
        <span style={{ flex: 1 }}>{label}</span>
        {hint && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: C.textD,
            background: C.surfLL,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            padding: "2px 5px",
          }}>{hint}</span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function GroupLabel({ children }) {
  return (
    <div style={{
      padding: "10px 12px 2px",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: C.textD,
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "6px 4px" }} />;
}

export default function SettingsDropdown({
  open,
  onClose,
  anchorRef,
  userProfile,
  isAdmin = false,
  onNavigateAdmin,
  onSignOut,
  currentProvince,
  onProvinceChange,
}) {
  const { t, lang, setLang } = useT();
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
  const roleLabel = roleKey ? t(roleKey) : null;
  const email = userProfile?.email || "";
  const displayName = userProfile?.full_name
    || userProfile?.name
    || userProfile?.email
    || "Utilisateur";
  const comingSoon = t("settings.comingSoon");

  const goUsersRoles = () => {
    onClose?.();
    onNavigateAdmin?.();
    if (typeof document === "undefined") return;
    requestAnimationFrame(() => {
      const el = document.getElementById("admin-users");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const doLogout = async () => { onClose?.(); await onSignOut?.(); };

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
      {/* ── Profil ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: "10px 12px 12px",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 2,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
          {displayName}
        </div>
        {email && email !== displayName && (
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
        )}
        {roleLabel && (
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
        )}
      </div>

      {/* ── Préférences ────────────────────────────────────────────────── */}
      <GroupLabel>{t("settings.section.preferences")}</GroupLabel>

      <SectionRow icon="🌐" label={t("settings.section.language")}>
        <ToggleGroup
          value={lang}
          onChange={setLang}
          options={[{ value: "en", label: "EN" }, { value: "fr", label: "FR" }]}
        />
      </SectionRow>

      <SectionRow icon="📍" label={t("common.province")}>
        <ProvinceSelect
          value={currentProvince || "QC"}
          onChange={(e) => onProvinceChange?.(e.target.value)}
          style={{ width: "100%", padding: "6px 8px", fontSize: 11, borderRadius: 6 }}
        />
      </SectionRow>

      <SectionRow icon="🎨" label={t("settings.section.theme")} hint={comingSoon}>
        <ToggleGroup
          disabled
          value="dark"
          options={[
            { value: "dark",  label: t("settings.theme.dark") },
            { value: "light", label: t("settings.theme.light") },
          ]}
        />
      </SectionRow>

      {/* ── Administration (admin / super_admin only) ─────────────────── */}
      {isAdmin && (
        <>
          <Divider />
          <GroupLabel>{t("settings.section.administration")}</GroupLabel>
          <MenuItem icon="👥" label={t("settings.item.usersRoles")} onClick={goUsersRoles} />
        </>
      )}

      {/* ── Compte ────────────────────────────────────────────────────── */}
      <Divider />
      <GroupLabel>{t("settings.section.account")}</GroupLabel>
      <MenuItem icon="🚪" label={t("settings.logout")} onClick={doLogout} />
      <div style={{ padding: "6px 12px 4px" }}>
        <span style={{ fontSize: 10, color: C.textD, fontFamily: "'DM Mono',monospace" }}>
          {t("settings.version")}: {APP_VERSION}
        </span>
      </div>
    </div>
  );
}
