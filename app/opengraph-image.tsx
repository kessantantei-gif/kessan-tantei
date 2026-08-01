import { ImageResponse } from "next/og";

export const alt = "決算探偵 グロース市場の決算分析・財務ランキング";
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
            "linear-gradient(135deg, #04130d 0%, #07111f 52%, #10231b 100%)",
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
            position: "absolute",
            width: 430,
            height: 430,
            borderRadius: 999,
            right: -80,
            top: -130,
            display: "flex",
            background: "rgba(34,197,94,0.18)",
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
              width: 900,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "fit-content",
                  border: "1px solid #4ade80",
                  borderRadius: 999,
                  padding: "10px 24px",
                  color: "#86efac",
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: 1,
                }}
              >
                GROWTH MARKET
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
                グロース市場を、決算から見抜く
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 20,
                  fontSize: 31,
                  color: "#cbd5e1",
                }}
              >
                成長企業の利益・営業CF・財務リスクを比較
              </div>

              <div style={{ display: "flex", gap: 18, marginTop: 34 }}>
                {["売上成長", "営業利益", "営業CF", "財務安全性", "リスク"].map(
                  (label) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        border: "1px solid rgba(74,222,128,0.55)",
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
            {[190, 135, 92].map((height, index) => (
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
                        ? "#4ade80"
                        : "#86efac",
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
