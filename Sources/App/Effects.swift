import SwiftUI

/// Anime-style impact flash: a bright core, a shock ring and speed lines bursting outward.
/// `progress` runs 0 → 1; gold for complete, sky blue for snooze.
struct FlashBurst: View, Animatable {
    var progress: Double
    let complete: Bool

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    var body: some View {
        Canvas { ctx, size in draw(&ctx, size) }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private func draw(_ ctx: inout GraphicsContext, _ size: CGSize) {
        let c = CGPoint(x: size.width / 2, y: size.height / 2)
        let p = progress
        let fade = max(0, 1 - p)
        let tint = complete ? Color(red: 1, green: 0.82, blue: 0.2) : Color(red: 0.35, green: 0.75, blue: 1)
        let reach = min(size.width, size.height) / 2

        // White-hot core that blooms then fades fast.
        let core: CGFloat = reach * CGFloat(0.25 + 0.55 * p)
        let glow = Gradient(colors: [Color.white.opacity(fade), tint.opacity(0.7 * fade), Color.clear])
        let coreRect = CGRect(x: c.x - core, y: c.y - core, width: core * 2, height: core * 2)
        ctx.fill(Path(ellipseIn: coreRect), with: .radialGradient(glow, center: c, startRadius: 0, endRadius: core))
        // Shock ring.
        let ring: CGFloat = reach * CGFloat(0.3 + 0.7 * p)
        let ringRect = CGRect(x: c.x - ring, y: c.y - ring, width: ring * 2, height: ring * 2)
        ctx.stroke(Path(ellipseIn: ringRect), with: .color(tint.opacity(0.9 * fade)), lineWidth: CGFloat(4 * fade + 1))
        // Speed lines, alternating long and short, shooting outward.
        let count = complete ? 16 : 10
        for i in 0..<count {
            let a = CGFloat(Double(i) / Double(count) * 2 * .pi + 0.2)
            let long = i.isMultiple(of: 2)
            let inner: CGFloat = reach * CGFloat(0.35 + 0.55 * p)
            let length: CGFloat = reach * (long ? 0.5 : 0.3) * CGFloat(1 - p * 0.5)
            let outer: CGFloat = min(inner + length, reach)
            var line = Path()
            line.move(to: CGPoint(x: c.x + cos(a) * inner, y: c.y + sin(a) * inner))
            line.addLine(to: CGPoint(x: c.x + cos(a) * outer, y: c.y + sin(a) * outer))
            let color: Color = long ? .white : tint
            ctx.stroke(line, with: .color(color.opacity(fade)), style: StrokeStyle(lineWidth: long ? 3 : 2, lineCap: .round))
        }
    }
}
