"use client";

import { useState } from "react";
import { openEmailComposer } from "@/lib/emailClient";

interface CustomerSupportCardProps {
  onClose: () => void;
}

export function CustomerSupportCard({ onClose }: CustomerSupportCardProps) {
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);

  const handleCopy = () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText("support@cinecub.stream");
      }
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = () => {
    setOpening(true);
    openEmailComposer("support@cinecub.stream", "CineCub Support Inquiry");
    setTimeout(() => setOpening(false), 1500);
  };

  return (
    <div
      className="support-modal-card"
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "#0f1017",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "26px",
        padding: "28px 24px 24px",
        width: "100%",
        maxWidth: "430px",
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(157, 78, 221, 0.1)",
        position: "relative",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div
          style={{
            width: "50px",
            height: "50px",
            borderRadius: "15px",
            background: "rgba(157, 78, 221, 0.18)",
            border: "1px solid rgba(157, 78, 221, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#c77dff",
            fontSize: "22px",
            flexShrink: 0,
          }}
        >
          <i className="fas fa-headset" />
        </div>
        <div>
          <div
            style={{
              fontSize: "21px",
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.2,
              letterSpacing: "-0.2px",
            }}
          >
            Customer Support
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#8e8d9f",
              marginTop: "4px",
              fontWeight: 500,
            }}
          >
            We typically respond within 24 hours
          </div>
        </div>
      </div>

      {/* Direct Email Card */}
      <div
        style={{
          marginTop: "22px",
          background: "#161722",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          borderRadius: "18px",
          padding: "18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              color: "#838294",
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            DIRECT EMAIL
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.5px",
              color: "#00d26a",
              background: "rgba(0, 210, 106, 0.12)",
              border: "1px solid rgba(0, 210, 106, 0.35)",
              borderRadius: "7px",
              padding: "3px 9px",
            }}
          >
            ONLINE
          </span>
        </div>

        <div
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "15.5px",
            fontWeight: 700,
            color: "#ffffff",
            margin: "14px 0 18px",
            wordBreak: "break-all",
          }}
        >
          support@cinecub.stream
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={handleSendEmail}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              background: "linear-gradient(135deg, #9d4edd 0%, #7b2cbf 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "13px",
              padding: "12px 14px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(157, 78, 221, 0.35)",
              transition: "filter 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
          >
            <i className={opening ? "fas fa-spinner fa-spin" : "fas fa-paper-plane"} />
            {opening ? "Opening..." : "Send Email"}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#ffffff",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "13px",
              padding: "12px 14px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255, 255, 255, 0.13)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")
            }
          >
            <i className={copied ? "fas fa-check" : "fas fa-copy"} />
            {copied ? "Copied!" : "Copy Email"}
          </button>
        </div>
      </div>

      {/* Close Button */}
      <button
        type="button"
        onClick={onClose}
        style={{
          width: "100%",
          marginTop: "18px",
          background: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          color: "#ffffff",
          borderRadius: "14px",
          padding: "13px",
          fontSize: "15px",
          fontWeight: 700,
          cursor: "pointer",
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "rgba(255, 255, 255, 0.14)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")
        }
      >
        Close
      </button>
    </div>
  );
}
