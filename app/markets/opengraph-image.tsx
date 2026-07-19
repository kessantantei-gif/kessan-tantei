import { ImageResponse } from "next/og";

export const alt = "決算探偵 日本株全市場の財務分析";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, #07131f 0%, #07111f 48%, #111036 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            display: "flex",
            padding: "58px 72px",
            alignItems: "stretch",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: "850px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "fit-content",
                  border: "1px solid #22d3ee",
                  borderRadius: 999,
                  padding: "10px 24px",
                  color: "#67e8f9",
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: 1,
                }}
              >
                KESSAN TANTEI
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 38,
                  fontSize: 78,
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                決算探偵
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 26,
                  fontSize: 46,
                  fontWeight: 800,
                  lineHeight: 1.2,
                }}
              >
                日本株全市場の財務分析
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 20,
                  fontSize: 31,
                  color: "#cbd5e1",
                }}
              >
                グロース・スタンダード・プライム対応
              </div>

              <div style={{ display: "flex", gap: 18, marginTop: 34 }}>
                {["成長性", "収益性", "営業CF", "財務安全性", "リスク"].map(
                  (label) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        border: "1px solid rgba(103,232,249,0.55)",
                        borderRadius: 999,
                        padding: "10px 22px",
                        fontSize: 26,
                        fontWeight: 800,
                        background: "rgba(15,23,42,0.72)",
                      }}
                    >
                      {label}
                    </div>
                  )
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 700,
                color: "#94a3b8",
              }}
            >
              kessan-tantei.jp
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 20,
              paddingBottom: 54,
            }}
          >
            {[170, 120, 82].map((height, index) => (
              <div
                key={height}
                style={{
                  display: "flex",
                  width: 38,
                  height,
                  borderRadius: 22,
                  background:
                    index === 0
                      ? "#22c55e"
                      : index === 1
                        ? "#22d3ee"
                        : "#8b5cf6",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
